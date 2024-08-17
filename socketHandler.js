const liveQueue = [];
const liveUsers = new Map();  // Use a Map to track users who are currently live by username
const activeStreams = new Map(); // Track active streams by username
let currentStreamer = null;

// Online users tracking
const onlineUsers = new Map();

const timers = {}; // Store timers for each live user

let slidePosition = 50; // Initial slide position
let slidePositionAmount = 5; // Initial slide position amount

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
  console.log(`Emitted 'is-next' with value 'false' for user: ${username}`);

  liveUsers.delete(username);
  activeStreams.delete(username);
  currentStreamer = liveQueue[0];

    const queueIndex = liveQueue.findIndex(clientId => onlineUsers.get(clientId) === username);
  if (queueIndex !== -1) {
    liveQueue.splice(queueIndex, 1);
    console.log(`Removed ${username} from the queue. Queue after removal: ${liveQueue.join(', ')}`);
  }

  if (liveQueue.length === 0) {
    currentStreamer = null;  
  } else {
    notifyNextUserInQueue(io);
  }

  updateLiveUsers(io);
  notifyNextUserInQueue(io);
  
  io.emit('main-feed', null); 
  stopTimer(username);
};

const notifyNextUserInQueue = (io) => {
  console.log("Notifying next user in queue...");

 
  if (liveQueue.length >= 1) {
      const nextClient = liveQueue.shift();
      const nextUsername = onlineUsers.get(nextClient);

      if (!nextUsername) {
          console.error(`Username for client ID ${nextClient} not found.`);
          notifyNextUserInQueue(io);
          return;
      }

      currentStreamer = nextUsername;
      console.log(`Current streamer set to: ${currentStreamer}`);

      // Emit events to all sockets associated with this username
      onlineUsers.forEach((user, socketId) => {
          if (user === nextUsername) {
              io.to(socketId).emit("go-live-prompt");
              io.to(socketId).emit("is-next", false);
              
              console.log(`Emitted 'go-live-prompt' and 'is-next' to socket: ${socketId}`);
          }
      });

      liveUsers.set(nextUsername, nextClient);
      activeStreams.set(nextUsername, nextClient);

      updateLiveUsers(io);
  } else {
      console.log("No one is live, emitting 'no-one-live'");
      io.emit("no-one-live");

      if (currentStreamer) {
          io.to(onlineUsers.get(currentStreamer)).emit("is-next", false);
          console.log(`Emitted 'is-next' with value 'false' for current streamer: ${currentStreamer}`);
          currentStreamer = null;
      }
  }
};



const updateLiveUsers = (io) => {
  console.log(`Updating live users: ${Array.from(liveUsers.keys()).join(', ')}`);
  io.emit('live-users', Array.from(liveUsers.keys())); 
};

const handleSocketConnection = (io) => {
  io.on("connection", (socket) => {
    console.log(`New client connected: ${socket.id}`);

    onlineUsers.set(socket.id, null);

    io.emit('update-online-users', onlineUsers.size);

    socket.on("register-user", (username) => {
      if (!username) {
        console.error(`Username not provided for socket ID: ${socket.id}`);
      } else {
        onlineUsers.set(socket.id, username); 
        console.log(`User registered: ${username} with socket ID: ${socket.id}`);
      }
      io.emit('update-online-users', onlineUsers.size);
    });

    socket.emit('current-position', slidePosition);
    socket.emit('current-slide-amount', slidePositionAmount);

    socket.on("set-initial-vote", (initialVote) => {
      slidePosition = initialVote;
      io.emit('vote-update', slidePosition); 
      io.emit('current-slide-amount', 5); 
      console.log(`Initial vote set by ${socket.id} to ${initialVote}`);
    });

    socket.on("vote", (newPosition) => {
      slidePosition = newPosition;
      io.emit('vote-update', slidePosition);

      if (slidePosition >= 100) {
        slidePositionAmount /= 2; 
        io.emit('current-slide-amount', slidePositionAmount);

        if (currentStreamer) {
          addTime(currentStreamer, io); 
        }

        slidePosition = 50; 
        io.emit('vote-update', slidePosition);
        console.log(`Slide position reset to 50 due to reaching 100, current slide amount: ${slidePositionAmount}`);
      } else if (slidePosition <= 0) {
        slidePositionAmount = 5; 
        io.emit('current-slide-amount', slidePositionAmount);
        stopLiveStream(onlineUsers.get(socket.id), io); 
        console.log(`Slide position reached 0, stopping live stream for ${onlineUsers.get(socket.id)}`);
      }
    });

    if (liveUsers.size > 0) {
      const currentLiveUser = Array.from(liveUsers.keys())[0];

      socket.emit("main-feed", currentLiveUser);
      console.log(`Sent main feed to ${socket.id}, current live user: ${currentLiveUser}`);
    }

    socket.on("join-queue", () => {
      const username = onlineUsers.get(socket.id);
    
      if (liveQueue.includes(socket.id)) {
        console.log(`User ${username} is already in the queue or currently live.`);
        socket.emit("queue-error", "Already in queue or currently live."); // Send an error message to the client
        return;
      }
    
      // Clear any residual state before rejoining
      if (username === currentStreamer) {
        console.log(`Resetting state for user: ${username} before rejoining the queue`);
        stopLiveStream(username, io);  // Ensure the user is fully removed from the current state
      }
    
      liveQueue.push(socket.id);
      console.log(`Client ${socket.id} (${username}) joined the queue. Queue length: ${liveQueue.length}`);
      
      const position = liveQueue.findIndex((socketId) => onlineUsers.get(socketId) === username) + 1;
   socket.emit("queue-position-update", position);

      if (liveQueue.length === 1) {
        io.to(socket.id).emit("go-live-prompt");
        console.log(`Emitted 'go-live' to client: ${socket.id}`);
      }
    

    
  });
  

    socket.on("check-username", (username, callback) => {
      const isInLiveQueue = liveQueue.some(socketId => onlineUsers.get(socketId) === username);
    
      const exists = isInLiveQueue;
    
      callback(exists);
  });

   // Listening for new comments
   socket.on("new-comment", (commentData) => {
    console.log(`New comment from ${commentData.username}: ${commentData.comment}`);
    
    // Broadcast the new comment to all clients
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

      liveUsers.set(username, socket.id);
      activeStreams.set(username, socket.id);
      currentStreamer = username;
      console.log(`Client ${socket.id} (${username}) going live`);
      updateLiveUsers(io);
      io.emit('main-feed', username);
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
        socket.to(id).emit("offer", socket.id, offer);
        console.log(`Emitted 'offer' from ${socket.id} to ${id}`);
      } catch (error) {
        console.error(`Error sending offer from ${socket.id} to ${id}:`, error);
      }
    });

    socket.on("answer", (id, answer) => {
      console.log(`Client ${socket.id} sending answer to ${id}`);
      socket.to(id).emit("answer", socket.id, answer);
    });

    socket.on("ice-candidate", (id, candidate) => {
      console.log(`Client ${socket.id} sending ICE candidate to ${id}`);
      socket.to(id).emit("ice-candidate", socket.id, candidate);
    });

    socket.on("stop-live", () => {
      const username = onlineUsers.get(socket.id);
      console.log(`Client ${socket.id} (${username}) stopping live`);

      // Remove from live queue
      const queueIndex = liveQueue.findIndex(socketId => socketId === socket.id);
      if (queueIndex !== -1) {
        liveQueue.splice(queueIndex, 1);
        console.log(`Removed socket ID ${socket.id} from live queue.`);
      }
      
      liveUsers.delete(username); 
      activeStreams.delete(username);
      updateLiveUsers(io); 
      notifyNextUserInQueue(io);
      io.emit('main-feed', null); 
      stopTimer(username);
    });

    socket.on("disconnect", () => {
      const username = onlineUsers.get(socket.id);
      console.log(`Client disconnected: ${socket.id} (${username})`);
    
      // Remove from online users
      onlineUsers.delete(socket.id);
    
      if (username) {
        // Remove from live users
        if (liveUsers.has(username)) {
          liveUsers.delete(username);
          console.log(`Removed ${username} from live users.`);
        }
    
        // Remove from active streams
        if (activeStreams.has(username)) {
          activeStreams.delete(username);
          console.log(`Removed ${username} from active streams.`);
        }

        
    
        // Remove from live queue
        const queueIndex = liveQueue.findIndex(socketId => socketId === socket.id);
    if (queueIndex !== -1) {
      liveQueue.splice(queueIndex, 1);
      console.log(`Removed socket ID ${socket.id} from live queue.`);
    }
    
        // Stop timer if running
        stopTimer(username);
    
        // If the disconnected user was the current streamer, reset currentStreamer and notify next user
        if (currentStreamer === username) {
          currentStreamer = null;
          notifyNextUserInQueue(io);
        }
      }
    
      updateLiveUsers(io);
      socket.broadcast.emit("peer-disconnected", socket.id);
    });
    

  });
};

module.exports = {
  handleSocketConnection,
  onlineUsers
};
