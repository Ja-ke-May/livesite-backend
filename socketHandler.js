const liveQueue = [];
let currentStreamer = null;
const liveUsers = new Map(); 

const onlineUsers = new Map();
const lastActivity = new Map();

const liveStartTime = new Map();

const timers = {}; 

const inactivityTimeout = 3600000; 

let slidePosition = 50;
let slidePositionAmount = 5;

const audioQueues = new Map();  
const processingAudioQueues = new Map();

const User = require('./models/user');

const processAudioQueue = (socket, username) => {
  const userAudioQueue = audioQueues.get(username);
  if (userAudioQueue && userAudioQueue.length > 0) {
    processingAudioQueues.set(username, true);

    const audioData = userAudioQueue.shift();
    socket.broadcast.emit('receive-audio', audioData);

    setTimeout(() => {
      processAudioQueue(socket, username);  
    }, 1000); 
  } else {
    processingAudioQueues.set(username, false);
  }
};


const startTimer = (username, io, stopLiveStream, additionalTime = 0) => {
  if (timers[username] && timers[username].interval) {
    clearInterval(timers[username].interval);
  }

  if (!timers[username]) {
    timers[username] = {};
  }

  timers[username].currentTime = (timers[username].currentTime || 60) + additionalTime;
  io.emit("timer-update", username, timers[username].currentTime);

  timers[username].interval = setInterval(() => {
    if (timers[username].currentTime > 0) {
      timers[username].currentTime -= 1;
      io.emit("timer-update", username, timers[username].currentTime);

      if (timers[username].currentTime <= 0) {
        clearInterval(timers[username].interval);
        delete timers[username];
        io.emit("timer-end", username);
        stopLiveStream(username, io); 
      }
    }
  }, 1000);
};

const stopTimer = (username) => {
  if (timers[username]) {
    clearInterval(timers[username].interval);
    delete timers[username];
  }
};

const addTime = (username, io) => {
  if (timers[username]) {
    timers[username].currentTime += 60;
    io.emit("timer-update", username, timers[username].currentTime);
  }
};

const recordLiveDuration = async (username) => {
  const startTime = liveStartTime.get(username);
  if (startTime) {
    const duration = Date.now() - startTime; 
    const durationInSeconds = duration / 1000; 
    const sessionTime = new Date(startTime).toLocaleString('en-GB', { timeZone: 'Europe/London' });


    try {
      const user = await User.findOne({ userName: username });
      if (!user) {
        console.error(`User ${username} not found in database.`);
        return;
      }

      const existingSession = user.recentActivity.find(activity => activity.includes(`on ${sessionTime}`));
      if (existingSession) {
        return; 
      }

      
      user.totalLiveDuration += durationInSeconds;

      let newActivityEntry = `Went live for ${durationInSeconds} seconds on ${sessionTime}`;

      
      if (durationInSeconds > user.longestLiveDuration) {
        user.longestLiveDuration = durationInSeconds;
        newActivityEntry += " with a new Longest Time Live!";
      }

      user.recentActivity.push(newActivityEntry);

      
      await user.save();
      
    } catch (err) {
      console.error(`Error updating live duration for user ${username}:`, err);
    }

    liveStartTime.delete(username); 
  } else {
    console.error(`No start time found for user ${username}.`);
  }
};



const stopLiveStream = async (username, io) => {
  if (currentStreamer !== username) return;

  
  io.to(liveUsers.get(username)).emit('reset-state');
  io.emit('main-feed', null); 
  
  liveUsers.delete(username); 
  currentStreamer = null;

  const queueIndex = liveQueue.findIndex(socketId => onlineUsers.get(socketId) === username);
  if (queueIndex !== -1) {
    liveQueue.splice(queueIndex, 1);
  }

  await recordLiveDuration(username); 

  stopTimer(username);
  notifyNextUserInQueue(io);
  updateUpNext(io);
};

const updateUpNext = (io) => {
  let nextUsername = null;

  if (liveQueue.length > 0) {
    const nextClientId = liveQueue[0];
    nextUsername = onlineUsers.get(nextClientId);
  }

  io.emit('up-next-update', nextUsername);
};

const notifyNextUserInQueue = (io) => {

  if (liveQueue.length >= 1) {
    const nextClient = liveQueue[0];
    const nextUsername = onlineUsers.get(nextClient);

    if (!nextUsername) {
      console.error(`Username for client ID ${nextClient} not found, removing from queue.`);
      liveQueue.shift();
      notifyNextUserInQueue(io); 
      return;
    }

    liveQueue.forEach((socketId, index) => {
      const userPosition = index + 1;
      io.to(socketId).emit("queue-position-update", userPosition);
    });

    if (!currentStreamer) {
      io.to(nextClient).emit("is-next", true);
      io.to(nextClient).emit("go-live-prompt");
      console.log(`Emitted 'go-live-prompt' to user: ${nextUsername}`);
    }

  } else {
    io.emit("no-one-live");
  }
};

const handleSocketConnection = (io) => {
  io.on("connection", async (socket) => {

    const username = onlineUsers.get(socket.id);

  if (username) {
    const user = await User.findOne({ userName: username });

    if (user && user.isBlocked) {
      socket.emit('forceLogout', { message: 'You are blocked.' });
      socket.disconnect(true);
      return;
    }
  }

    onlineUsers.set(socket.id, null);
    lastActivity.set(socket.id, Date.now());

    const updateOnlineUsersCount = () => {
      io.emit('update-online-users', onlineUsers.size); 
    };

    updateOnlineUsersCount();

    const activityChecker = setInterval(() => {
      const now = Date.now();
      const last = lastActivity.get(socket.id);
      const username = onlineUsers.get(socket.id);

      if (!username && last && now - last > inactivityTimeout) {
        socket.disconnect(true);
        clearInterval(activityChecker);
      }
    }, inactivityTimeout / 2);

    socket.on("register-user", async (username) => {
      if (!username) {
        console.error(`Username not provided for socket ID: ${socket.id}`);
        onlineUsers.set(socket.id, 'guest');
        return; 
      }

      const user = await User.findOne({ userName: username });
      if (!user) {
        console.error(`User not found for socket ID: ${socket.id}`);
        return;
      }

      if (user.isBlocked) {
        const now = new Date();
        if (user.blockExpiryDate && now < user.blockExpiryDate) {
          socket.emit('forceLogout', { message: `You are blocked until ${user.blockExpiryDate}` });
          console.log(`Blocked user ${username} tried to connect. Forcing logout.`);
          return;
        } else if (!user.blockExpiryDate) {
          socket.emit('forceLogout', { message: 'You are permanently blocked.' });
          console.log(`Permanently blocked user ${username} tried to connect. Forcing logout.`);
          return;
        }
      }

      
      if (user.blockExpiryDate && new Date() >= user.blockExpiryDate) {
        user.isBlocked = false;
        user.blockExpiryDate = null;
        await user.save();
      }
      onlineUsers.set(socket.id, username);
      lastActivity.set(socket.id, Date.now());
      

      updateOnlineUsersCount();
      updateUpNext(io);
    });

    socket.emit('current-position', slidePosition);
    socket.emit('current-slide-amount', slidePositionAmount);

    socket.on("set-initial-vote", (initialVote) => {
      slidePosition = initialVote;
      lastActivity.set(socket.id, Date.now());
      io.emit('vote-update', slidePosition);
      io.emit('current-slide-amount', 5);
    });

    socket.on("vote", async (newPosition) => {

      const username = onlineUsers.get(socket.id);

  if (!username) {
    console.error(`Username for socket ID ${socket.id} not found. Cannot process vote.`);
    return;
  }

  const user = await User.findOne({ userName: username });

  if (user && user.isBlocked) {
    socket.emit('vote-error', { message: 'You are blocked from voting.' });
    return;
  }

      slidePosition = newPosition;
      lastActivity.set(socket.id, Date.now());
      io.emit('vote-update', slidePosition);

      if (slidePosition >= 100) {
        slidePositionAmount /= 2;
        io.emit('current-slide-amount', slidePositionAmount);
        io.emit('reset-votes');
        if (currentStreamer) {
          addTime(currentStreamer, io);

          try {
            await axios.post('https://livesite-backend.onrender.com/award-tokens', {
              username: currentStreamer,
              amount: 100
            }, {
              headers: {
                'Authorization': `Bearer ${yourAuthToken}`
              }
            });

            console.log(`Awarded 100 tokens to ${currentStreamer}`);
          } catch (error) {
            console.error(`Failed to award tokens to ${currentStreamer}:`, error.response ? error.response.data : error.message);
          }
        }

        slidePosition = 50;
        io.emit('vote-update', slidePosition);
      } else if (slidePosition <= 0) {
        slidePositionAmount = 5;
        io.emit('current-slide-amount', slidePositionAmount);
        stopLiveStream(currentStreamer, io);
      }
    });

    if (currentStreamer) {
      socket.emit("main-feed", currentStreamer);
    }

    socket.on("join-queue", ({ username, isFastPass }) => {
      lastActivity.set(socket.id, Date.now());
      io.emit('update-online-users', onlineUsers.size);
      
      if (liveQueue.includes(socket.id)) {
        socket.emit("queue-error", "Already in queue or currently live.");
        return;
      }
      
      if (username === currentStreamer) {
        stopLiveStream(username, io);
      }
      
      if (isFastPass) {
        let fastPassCount = 0;
      
        liveQueue.forEach(socketId => {
          const queuedUser = onlineUsers.get(socketId);
          if (queuedUser && queuedUser.isFastPass) {
            fastPassCount++;
          }
        });
      
        const nonFastPassIndex = liveQueue.findIndex(socketId => {
          const queuedUser = onlineUsers.get(socketId);
          return queuedUser && !queuedUser.isFastPass;
        });
      
        let insertionIndex;
        if (nonFastPassIndex === -1) {
          insertionIndex = liveQueue.length;
        } else {
          insertionIndex = nonFastPassIndex + fastPassCount + 2;
          if (insertionIndex > liveQueue.length) {
            insertionIndex = liveQueue.length;
          }
        }
        
        liveQueue.splice(insertionIndex, 0, socket.id);
      
        console.log(`User ${username} used Fast Pass and was inserted at position ${insertionIndex + 1} in the queue.`);
      } else {
        liveQueue.push(socket.id);
        console.log(`Client ${socket.id} (${username}) joined the queue. Queue length: ${liveQueue.length}`);
      }
      
      
      liveQueue.forEach((socketId, index) => {
        io.to(socketId).emit("queue-position-update", index + 1);
      });

      io.emit("queue-length-update", liveQueue.length);
      
      
      if (liveQueue.length === 1 && !currentStreamer) {
        io.to(socket.id).emit("go-live-prompt");
        console.log(`Emitted 'go-live' to client: ${socket.id}`);
      }
      
      updateUpNext(io);
    });
    

    socket.on("check-username", (username, callback) => {
      const isInLiveQueue = liveQueue.some(socketId => onlineUsers.get(socketId) === username);
      lastActivity.set(socket.id, Date.now());
      const exists = isInLiveQueue;

      callback(exists);
    });

    socket.on("new-comment", async (commentData) => {
      try {
        const username = commentData.username;

        
        const user = await User.findOne({ userName: username });

        if (!user) {
          console.error(`User ${username} not found for comment.`);
          return;
        }

        
        const commentWithColors = {
          username: commentData.username,
          comment: commentData.comment,
          commentColor: user.commentColor,
          borderColor: user.borderColor,
          usernameColor: user.usernameColor,
          createdAt: new Date(),
        };

        
        io.emit('new-comment', commentWithColors);

      } catch (error) {
        console.error('Error handling new comment:', error);
      }
    });

    socket.on('send-audio', (audioBase64) => {
      const username = onlineUsers.get(socket.id);
      if (!audioQueues.has(username)) {
        audioQueues.set(username, []);
      }
      audioQueues.get(username).push(audioBase64);
    
      if (!processingAudioQueues.get(username)) {
        processAudioQueue(socket, username);
      }
    });

    socket.on("go-live", () => {
      io.emit('main-feed', null);
      io.emit('update-online-users', onlineUsers.size);
      io.emit("queue-length-update", liveQueue.length);
    
      slidePosition = 50;
      slidePositionAmount = 5;
    
      io.emit('current-position', slidePosition);
      io.emit('current-slide-amount', slidePositionAmount);
    
      const username = onlineUsers.get(socket.id);
      if (!username) {
        console.error(`Username for client ID ${socket.id} not found.`);
        return;
      }
    
      if (currentStreamer) {
        stopLiveStream(currentStreamer, io);
      }
    
      currentStreamer = username;
      liveUsers.set(username, socket.id); 
      liveStartTime.set(username, Date.now());
      lastActivity.set(socket.id, Date.now());
      io.emit('main-feed', username);
      io.emit('new-peer', socket.id); 
    
      startTimer(username, io, stopLiveStream);
    });
    

    socket.on("request-offer", (liveUsername) => {
      const liveUserSocketId = liveUsers.get(liveUsername);
      if (liveUserSocketId) {
        io.to(liveUserSocketId).emit("new-peer", socket.id);
      }
    });

    socket.on("offer", (id, offer) => {
      try {
        socket.to(id).emit("offer", socket.id, offer);
        lastActivity.set(socket.id, Date.now());
      } catch (error) {
        console.error(`Error sending offer from ${socket.id} to ${id}:`, error);
      }
    });

    socket.on("answer", (id, answer) => {
      try {
        socket.to(id).emit("answer", socket.id, answer);
        lastActivity.set(socket.id, Date.now());
      } catch (error) {
        console.error(`Error relaying answer from ${socket.id} to ${id}:`, error);
      }
    });

    socket.on("ice-candidate", (id, candidate) => {
      socket.to(id).emit("ice-candidate", socket.id, candidate);
      lastActivity.set(socket.id, Date.now());
    });

    socket.on("stop-live", () => {
      const username = onlineUsers.get(socket.id);
      if (!username) {
        console.error(`Username for socket ID ${socket.id} not found. Cannot stop live stream.`);
        return;
      }

      const queueIndex = liveQueue.findIndex(socketId => socketId === socket.id);
      if (queueIndex !== -1) {
        liveQueue.splice(queueIndex, 1);
      }

      if (currentStreamer === username) {
        liveUsers.delete(username); 
        currentStreamer = null;
        stopTimer(username);
        io.emit('main-feed', null);
        notifyNextUserInQueue(io);
        updateUpNext(io);
      }
    });

     
      socket.on('forceLogout', () => {
        socket.disconnect(true);
      });

    socket.on("disconnect", async () => {
  const username = onlineUsers.get(socket.id);

  
  onlineUsers.delete(socket.id);
  lastActivity.delete(socket.id);
  updateOnlineUsersCount(); 
  io.emit("queue-length-update", liveQueue.length);

  try {
    if (username) {
      
      const queueIndex = liveQueue.indexOf(socket.id);
      if (queueIndex !== -1) {
        liveQueue.splice(queueIndex, 1);
      }

      
      if (username === currentStreamer) {
        await stopLiveStream(username, io);
      } else {
        await recordLiveDuration(username);
      }
    }
  } catch (error) {
    console.error(`Error handling disconnection for ${username}:`, error);
  }

  
  clearInterval(activityChecker);
  socket.broadcast.emit("peer-disconnected", socket.id);
  notifyNextUserInQueue(io);
});

updateOnlineUsersCount();
  });
};

module.exports = {
  handleSocketConnection,
  onlineUsers
};
