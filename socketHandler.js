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
  currentStreamer = null;

    const queueIndex = liveQueue.findIndex(clientId => onlineUsers.get(clientId) === username);
  if (queueIndex !== -1) {
    liveQueue.splice(queueIndex, 1);
    console.log(`Removed ${username} from the queue. Queue after removal: ${liveQueue.join(', ')}`);
  }

  updateLiveUsers(io);
  notifyNextUserInQueue(io);
  io.emit('main-feed', null); 
  stopTimer(username);
};

const notifyNextUserInQueue = (io) => {
  console.log("Notifying next user in queue...");

  if (liveQueue.length > 0) {
    const nextClient = liveQueue.shift();
    const nextUsername = onlineUsers.get(nextClient);

    if (!nextUsername) {
      console.error(`Username for client ID ${nextClient} not found.`);
      notifyNextUserInQueue(io); 
      return;
    }

   

    currentStreamer = nextUsername;
    console.log(`Current streamer set to: ${currentStreamer}`);

    io.to(nextClient).emit("go-live");
    console.log(`Emitted 'go-live' to client: ${nextClient}`);

    io.to(nextClient).emit("is-next", true);
    console.log(`Emitted 'is-next' with value 'true' to client: ${nextClient} (Username: ${nextUsername})`);

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
    
      // Clear any residual state before rejoining
      if (username === currentStreamer) {
        console.log(`Resetting state for user: ${username} before rejoining the queue`);
        currentStreamer = null;
        io.to(socket.id).emit("is-next", true);
      }
    
      liveQueue.push(socket.id);
      console.log(`Client ${socket.id} (${username}) joined the queue. Queue length: ${liveQueue.length}`);
      
      if (liveQueue.length === 1) {
        io.to(socket.id).emit("go-live");
        console.log(`Emitted 'go-live' to client: ${socket.id}`);
      }
    });
    

    socket.on("go-live", () => {
      if (currentStreamer) {
        console.warn(`Cannot go live. Current streamer is ${currentStreamer}`);
        io.to(onlineUsers.get(currentStreamer)).emit("is-next", false);
        return;
      }

      const username = onlineUsers.get(socket.id);
      if (!username) {
        console.error(`Username for client ID ${socket.id} not found.`);
        return;
      }

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

      onlineUsers.delete(socket.id);

      if (username) {
        liveUsers.delete(username);
        activeStreams.delete(username);

        if (currentStreamer === username) {
          currentStreamer = null;
          notifyNextUserInQueue(io);
        } else {
          io.to(socket.id).emit("is-next", false); 
        }

        stopTimer(username);
      }

      const queueIndex = liveQueue.indexOf(socket.id);
      if (queueIndex !== -1) {
        liveQueue.splice(queueIndex, 1);
      }
      console.log(`Queue after disconnection: ${liveQueue.join(', ')}`);

      updateLiveUsers(io);
      socket.broadcast.emit("peer-disconnected", socket.id);
    });

  });
};

module.exports = {
  handleSocketConnection,
  onlineUsers
};
