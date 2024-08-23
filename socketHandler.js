const liveQueue = [];
let currentStreamer = null;
const liveUsers = new Map(); // Track live users and their corresponding socket IDs

// Online users tracking
const onlineUsers = new Map();
const lastActivity = new Map();

const timers = {}; // Store timers for the live user

const inactivityTimeout = 3600000; // 1 hour

let slidePosition = 50;
let slidePositionAmount = 5;

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

const stopLiveStream = (username, io) => {
  if (currentStreamer !== username) return;

  console.log(`Stopping live stream for user: ${username}`);
  
  io.to(onlineUsers.get(username)).emit('is-next', false);
  io.emit('main-feed', null); // Notify all clients that the stream has ended
  
  liveUsers.delete(username); // Remove from live users
  currentStreamer = null;

  const queueIndex = liveQueue.findIndex(socketId => onlineUsers.get(socketId) === username);
  if (queueIndex !== -1) {
    liveQueue.splice(queueIndex, 1);
    console.log(`Removed ${username} from the queue. Queue after removal: ${liveQueue.join(', ')}`);
  }

  notifyNextUserInQueue(io);
  stopTimer(username);
  cleanupWebRTCConnections(io); // Cleanup WebRTC connections
  updateUpNext(io);
};

const cleanupWebRTCConnections = (io) => {
  console.log("Cleaning up all WebRTC connections for the previous streamer...");
  io.emit('cleanup-connections');
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
      console.error(`Username for client ID ${nextClient} not found.`);
      notifyNextUserInQueue(io);
      return;
    }

    if (!currentStreamer) {
      io.to(nextClient).emit("is-next", true);
      console.log(`Emitted 'is-next' with value 'true' for user: ${nextUsername}`);
    }

    liveQueue.forEach((socketId, index) => {
      const userPosition = index + 1;
      io.to(socketId).emit("queue-position-update", userPosition);
      console.log(`Emitted updated queue position ${userPosition} to socket ID: ${socketId}`);
    });

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

    io.emit('update-online-users', onlineUsers.size);

    socket.on("register-user", (username) => {
      if (!username) {
        console.error(`Username not provided for socket ID: ${socket.id}`);
      } else {
        onlineUsers.set(socket.id, username);
        lastActivity.set(socket.id, Date.now());
        console.log(`User registered: ${username} with socket ID: ${socket.id}`);
      }
      io.emit('update-online-users', onlineUsers.size);
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
        stopLiveStream(onlineUsers.get(socket.id), io); 
        console.log(`Slide position reached 0, stopping live stream for ${username}`);
      }
    });

    if (currentStreamer) {
      socket.emit("main-feed", currentStreamer);
      console.log(`Sent main feed to ${socket.id}, current live user: ${currentStreamer}`);
    }

    socket.on("join-queue", ({ username, isFastPass }) => {
      lastActivity.set(socket.id, Date.now());

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
        let insertionIndex = 1;

        for (let i = 1; i < liveQueue.length; i++) {
          const socketId = liveQueue[i];
          if (!onlineUsers.get(socketId)?.isFastPass) {
            break;
          }
          insertionIndex++;
        }

        liveQueue.splice(insertionIndex, 0, socket.id);
        console.log(`User ${username} used Fast Pass and was inserted at position ${insertionIndex + 1} in the queue.`);
      } else {
        liveQueue.push(socket.id);
        console.log(`Client ${socket.id} (${username}) joined the queue. Queue length: ${liveQueue.length}`);
      }

      const position = liveQueue.findIndex((socketId) => onlineUsers.get(socketId) === username) + 1;
      socket.emit("queue-position-update", position);

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

    socket.on("new-comment", (commentData) => {
      console.log(`New comment from ${commentData.username}: ${commentData.comment}`);
      lastActivity.set(socket.id, Date.now());
      io.emit('new-comment', commentData);
    });

    socket.on("go-live", () => {
      if (currentStreamer) {
        console.warn(`Cannot go live. Current streamer is ${currentStreamer}`);
        io.to(onlineUsers.get(currentStreamer)).emit("is-next", true);
        return;
      }

      const username = onlineUsers.get(socket.id);
      if (!username) {
        console.error(`Username for client ID ${socket.id} not found.`);
        return;
      }

      slidePosition = 50;
      slidePositionAmount = 5;

      socket.emit('current-position', slidePosition);
      socket.emit('current-slide-amount', slidePositionAmount);

      currentStreamer = username;
      liveUsers.set(username, socket.id); // Track the live user
      console.log(`Client ${socket.id} (${username}) going live`);
      lastActivity.set(socket.id, Date.now());
      io.emit('main-feed', username);
      startTimer(username, io, stopLiveStream);

      // Notify all viewers to establish peer connections with the new streamer
      io.emit('new-peer', socket.id); // Send the socket ID of the new streamer to all clients
    });

    socket.on("request-offer", (liveUsername) => {
      const liveUserSocketId = liveUsers.get(liveUsername);
      if (liveUserSocketId) {
        io.to(liveUserSocketId).emit("new-peer", socket.id);
        console.log(`Emitted 'new-peer' to live user socket ID: ${liveUserSocketId}`);
      }
      updateUpNext(io);
    });

    socket.on("offer", (id, offer) => {
      try {
        console.log(`Emitted 'offer' from ${socket.id} to ${id}`);
        socket.to(id).emit("offer", socket.id, offer);
        lastActivity.set(socket.id, Date.now());
      } catch (error) {
        console.error(`Error sending offer from ${socket.id} to ${id}:`, error);
      }
      updateUpNext(io);
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
      console.log(`Client ${socket.id} (${username}) stopping live`);

      const queueIndex = liveQueue.findIndex(socketId => socketId === socket.id);
      if (queueIndex !== -1) {
        liveQueue.splice(queueIndex, 1);
        console.log(`Removed socket ID ${socket.id} from live queue.`);
      }

      liveUsers.delete(username); // Remove from live users
      currentStreamer = null;
      notifyNextUserInQueue(io);
      io.emit('main-feed', null);
      stopTimer(username);
      cleanupWebRTCConnections(io); // Cleanup WebRTC connections
      updateUpNext(io);
    });

    socket.on("disconnect", () => {
      const username = onlineUsers.get(socket.id);
      console.log(`Client disconnected: ${socket.id} (${username})`);
    
      onlineUsers.delete(socket.id);
      lastActivity.delete(socket.id);
    
      const queueIndex = liveQueue.indexOf(socket.id);
      if (queueIndex !== -1) {
        liveQueue.splice(queueIndex, 1);
        console.log(`Removed socket ID ${socket.id} from live queue.`);
      }
    
      // Check if the disconnected user is the current live streamer
      if (username) {
        if (currentStreamer === username) {
          console.log(`Current live streamer ${username} has disconnected.`);
          liveUsers.delete(username); // Remove from live users
          currentStreamer = null;
    
          notifyNextUserInQueue(io);
    
          // Stop the timer and cleanup WebRTC connections
          stopTimer(username);
          cleanupWebRTCConnections(io);
          io.emit('main-feed', null); // Notify all clients that the stream has ended
        } else {
          console.log(`Disconnected user ${username} was not the live streamer, no impact on the live stream.`);
        }
      }
    
      clearInterval(activityChecker);
      socket.broadcast.emit("peer-disconnected", socket.id);
    });
    

  });
};

module.exports = {
  handleSocketConnection,
  onlineUsers
};
