const liveQueue = [];
let currentStreamer = null;
const liveUsers = new Map(); // Track live users and their corresponding socket IDs

// Online users tracking
const onlineUsers = new Map();
const lastActivity = new Map();

const liveStartTime = new Map();

const timers = {}; // Store timers for the live user

const inactivityTimeout = 3600000; // 1 hour

let slidePosition = 50;
let slidePositionAmount = 5;

const User = require('./models/user');

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
        stopLiveStream(username, io);  // End the live stream when time runs out
      }
    }
  }, 1000);
};

const stopTimer = (username) => {
  if (timers[username]) {
    clearInterval(timers[username].interval);
    delete timers[username];
    console.log(`Timer stopped for user: ${username}`);
  }
};

const addTime = (username, io) => {
  if (timers[username]) {
    timers[username].currentTime += 60;
    io.emit("timer-update", username, timers[username].currentTime);
    console.log(`Added time to timer for user: ${username}, new time: ${timers[username].currentTime}`);
  }
};

const recordLiveDuration = async (username) => {
  const startTime = liveStartTime.get(username);
  if (startTime) {
    const duration = Date.now() - startTime; // Calculate duration in milliseconds
    const durationInSeconds = duration / 1000; // Convert to seconds
    const sessionTime = new Date(startTime).toLocaleString('en-GB', { timeZone: 'Europe/London' });

    console.log(`User ${username} was live for ${durationInSeconds} seconds.`);

    try {
      // Fetch the user from the database
      const user = await User.findOne({ userName: username });
      if (!user) {
        console.error(`User ${username} not found in database.`);
        return;
      }

      // Check if there's already a session with the same timestamp
      const existingSession = user.recentActivity.find(activity => activity.includes(`on ${sessionTime}`));
      if (existingSession) {
        console.log(`Duplicate session detected for ${username} at ${sessionTime}. Skipping record.`);
        return; // Skip recording this duplicate session
      }

      // Update the total live duration
      user.totalLiveDuration += durationInSeconds;

      let newActivityEntry = `Went live for ${durationInSeconds} seconds on ${sessionTime}`;

      // Update the longest live duration if this session is longer
      if (durationInSeconds > user.longestLiveDuration) {
        user.longestLiveDuration = durationInSeconds;
        newActivityEntry += " with a new Longest Time Live!";
      }

      user.recentActivity.push(newActivityEntry);

      // Save the updated user document
      await user.save();
      console.log(`Updated live duration for user ${username}. Total: ${user.totalLiveDuration} seconds, Longest: ${user.longestLiveDuration} seconds.`);
    } catch (err) {
      console.error(`Error updating live duration for user ${username}:`, err);
    }

    liveStartTime.delete(username); // Clean up the start time
  } else {
    console.error(`No start time found for user ${username}.`);
  }
};



const stopLiveStream = async (username, io) => {
  if (currentStreamer !== username) return;

  console.log(`Stopping live stream for user: ${username}`);
  
  io.to(liveUsers.get(username)).emit('reset-state');
  io.emit('main-feed', null); // Notify all clients that the stream has ended
  
  liveUsers.delete(username); // Remove from live users
  currentStreamer = null;

  const queueIndex = liveQueue.findIndex(socketId => onlineUsers.get(socketId) === username);
  if (queueIndex !== -1) {
    liveQueue.splice(queueIndex, 1);
    console.log(`Removed ${username} from the queue. Queue after removal: ${liveQueue.join(', ')}`);
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
  console.log(`upNext updated to: ${nextUsername}`);
};

const notifyNextUserInQueue = (io) => {
  console.log("Notifying next user in queue...");

  if (liveQueue.length >= 1) {
    const nextClient = liveQueue[0];
    const nextUsername = onlineUsers.get(nextClient);

    if (!nextUsername) {
      console.error(`Username for client ID ${nextClient} not found, removing from queue.`);
      liveQueue.shift(); // Remove the user from the queue
      notifyNextUserInQueue(io); // Try notifying the next user in queue
      return;
    }

    liveQueue.forEach((socketId, index) => {
      const userPosition = index + 1;
      io.to(socketId).emit("queue-position-update", userPosition);
      console.log(`Emitted updated queue position ${userPosition} to socket ID: ${socketId}`);
    });

    if (!currentStreamer) {
      io.to(nextClient).emit("is-next", true);
      io.to(nextClient).emit("go-live-prompt");
      console.log(`Emitted 'go-live-prompt' to user: ${nextUsername}`);
    }

  } else {
    console.log("No one is live, emitting 'no-one-live'");
    io.emit("no-one-live");
  }
};

const handleSocketConnection = (io) => {
  io.on("connection", (socket) => {
    console.log(`New client connected: ${socket.id}`);

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
        console.log(`Client ${socket.id} inactive for too long, disconnecting...`);
        socket.disconnect(true);
        clearInterval(activityChecker);
      }
    }, inactivityTimeout / 2);

    socket.on("register-user", (username) => {
      if (!username) {
        console.error(`Username not provided for socket ID: ${socket.id}`);
        onlineUsers.set(socket.id, 'guest');
        return; // Prevent further actions if no username is provided
      }
      onlineUsers.set(socket.id, username);
      lastActivity.set(socket.id, Date.now());
      
      console.log(`User registered: ${username} with socket ID: ${socket.id}`);

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
      console.log(`Initial vote set by ${socket.id} to ${initialVote}`);
    });

    socket.on("vote", async (newPosition) => {
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
        console.log(`Slide position reset to 50 due to reaching 100, current slide amount: ${slidePositionAmount}`);
      } else if (slidePosition <= 0) {
        slidePositionAmount = 5;
        io.emit('current-slide-amount', slidePositionAmount);
        stopLiveStream(currentStreamer, io);
      }
    });

    if (currentStreamer) {
      socket.emit("main-feed", currentStreamer);
      console.log(`Sent main feed to ${socket.id}, current live user: ${currentStreamer}`);
    }

    socket.on("join-queue", ({ username, isFastPass }) => {
      lastActivity.set(socket.id, Date.now());
      io.emit('update-online-users', onlineUsers.size);
      
      if (liveQueue.includes(socket.id)) {
        console.log(`User ${username} is already in the queue or currently live.`);
        socket.emit("queue-error", "Already in queue or currently live.");
        return;
      }
      
      if (username === currentStreamer) {
        console.log(`Resetting state for user: ${username} before rejoining the queue`);
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
      
      // Emit queue position updates
      liveQueue.forEach((socketId, index) => {
        io.to(socketId).emit("queue-position-update", index + 1);
      });

      io.emit("queue-length-update", liveQueue.length + 1);
      
      // If this is the first user in the queue and no one is streaming, prompt them to go live
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

        // Fetch the user's color preferences from the database
        const user = await User.findOne({ userName: username });

        if (!user) {
          console.error(`User ${username} not found for comment.`);
          return;
        }

        // Include the user's color settings in the comment data
        const commentWithColors = {
          username: commentData.username,
          comment: commentData.comment,
          commentColor: user.commentColor,
          borderColor: user.borderColor,
          usernameColor: user.usernameColor,
          createdAt: new Date(),
        };

        // Emit the comment with colors to all clients
        io.emit('new-comment', commentWithColors);

        console.log(`New comment from ${username} with colors:`, commentWithColors);
      } catch (error) {
        console.error('Error handling new comment:', error);
      }
    });

    socket.on("go-live", () => {
      io.emit('main-feed', null);
      io.emit('update-online-users', onlineUsers.size);
    
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
        console.log(`Current streamer ${currentStreamer} is being replaced by ${username}.`);
        stopLiveStream(currentStreamer, io);
      }
    
      currentStreamer = username;
      liveUsers.set(username, socket.id); 
      liveStartTime.set(username, Date.now());
      console.log(`Client ${socket.id} (${username}) going live`);
      lastActivity.set(socket.id, Date.now());
      io.emit('main-feed', username);
      io.emit('new-peer', socket.id); 
    
      startTimer(username, io, stopLiveStream);
    });
    

    socket.on("request-offer", (liveUsername) => {
      const liveUserSocketId = liveUsers.get(liveUsername);
      if (liveUserSocketId) {
        io.to(liveUserSocketId).emit("new-peer", socket.id);
        console.log(`Emitted 'new-peer' to live user socket ID: ${liveUserSocketId}`);
      }
    });

    socket.on("offer", (id, offer) => {
      try {
        console.log(`Emitted 'offer' from ${socket.id} to ${id}`);
        socket.to(id).emit("offer", socket.id, offer);
        lastActivity.set(socket.id, Date.now());
      } catch (error) {
        console.error(`Error sending offer from ${socket.id} to ${id}:`, error);
      }
    });

    socket.on("answer", (id, answer) => {
      try {
        console.log(`Relaying answer from ${socket.id} to ${id}`);
        socket.to(id).emit("answer", socket.id, answer);
        lastActivity.set(socket.id, Date.now());
      } catch (error) {
        console.error(`Error relaying answer from ${socket.id} to ${id}:`, error);
      }
    });

    socket.on("ice-candidate", (id, candidate) => {
      console.log(`Client ${socket.id} sending ICE candidate to ${id}`);
      socket.to(id).emit("ice-candidate", socket.id, candidate);
      lastActivity.set(socket.id, Date.now());
    });

    socket.on("stop-live", () => {
      const username = onlineUsers.get(socket.id);
      if (!username) {
        console.error(`Username for socket ID ${socket.id} not found. Cannot stop live stream.`);
        return;
      }
      console.log(`Client ${socket.id} (${username}) stopping live`);

      const queueIndex = liveQueue.findIndex(socketId => socketId === socket.id);
      if (queueIndex !== -1) {
        liveQueue.splice(queueIndex, 1);
        console.log(`Removed socket ID ${socket.id} from live queue.`);
      }

      if (currentStreamer === username) {
        liveUsers.delete(username); // Remove from live users
        currentStreamer = null;
        stopTimer(username);
        io.emit('main-feed', null);
        notifyNextUserInQueue(io);
        updateUpNext(io);
      }
    });

    socket.on("disconnect", async () => {
  const username = onlineUsers.get(socket.id);
  console.log(`Client disconnected: ${socket.id} (${username || 'unregistered user'})`);

  // Remove the user from tracking maps
  onlineUsers.delete(socket.id);
  lastActivity.delete(socket.id);
  updateOnlineUsersCount(); 

  try {
    if (username) {
      // Remove the user from the live queue if present
      const queueIndex = liveQueue.indexOf(socket.id);
      if (queueIndex !== -1) {
        liveQueue.splice(queueIndex, 1);
        console.log(`Removed socket ID ${socket.id} from live queue.`);
      }

      // If the user was the current live streamer, stop their stream
      if (username === currentStreamer) {
        console.log(`Current live streamer ${username} has disconnected.`);
        await stopLiveStream(username, io);
      } else {
        await recordLiveDuration(username);
        console.log(`Recorded live duration for disconnected user ${username}`);
      }
    }
  } catch (error) {
    console.error(`Error handling disconnection for ${username}:`, error);
  }

  // Clean up the activity checker interval and notify other users
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
