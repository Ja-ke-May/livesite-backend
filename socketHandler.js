const liveQueue = [];
const liveUsers = new Set();  // Track users who are currently live
const activeStreams = new Map(); // Track active streams 
let currentStreamer = null;

// Online users tracking
const onlineUsers = new Set();

const timers = {}; // Store timers for each live user

let slidePosition = 50; // Initial slide position
let slidePositionAmount = 5; // Initial slide position amount

const startTimer = (userId, io, stopLiveStream) => {
  if (timers[userId]) {
    clearInterval(timers[userId]);
  }
  let timer = 60;
  timers[userId] = setInterval(() => {
    timer -= 1;
    io.emit("timer-update", userId, timer);
    if (timer <= 0) {
      clearInterval(timers[userId]);
      io.emit("timer-end", userId);
      stopLiveStream(userId, io);
    }
  }, 1000);
};

const extendTimer = (userId, additionalTime, io, stopLiveStream) => {
  if (timers[userId]) {
    clearInterval(timers[userId]);
  }
  let timer = additionalTime;
  timers[userId] = setInterval(() => {
    timer -= 1;
    io.emit("timer-update", userId, timer);
    if (timer <= 0) {
      clearInterval(timers[userId]);
      io.emit("timer-end", userId);
      stopLiveStream(userId, io);
    }
  }, 1000);
};

const stopTimer = (userId) => {
  if (timers[userId]) {
    clearInterval(timers[userId]);
    delete timers[userId];
  }
};

const stopLiveStream = (userId, io) => {
  liveQueue.shift();
  liveUsers.delete(userId);
  activeStreams.delete(userId);
  updateLiveUsers(io);
  notifyNextUserInQueue(io);
  io.emit('main-feed', null);
  stopTimer(userId);
};

const notifyNextUserInQueue = (io) => {
  if (liveQueue.length > 0) {
    const nextClient = liveQueue[0];
    console.log(`Notifying next client in queue: ${nextClient}`);
    io.to(nextClient).emit("go-live");
  } else {
    io.emit("no-one-live"); // Notify all clients that no one is live
  }
};

const updateLiveUsers = (io) => {
  io.emit('live-users', Array.from(liveUsers)); // Broadcast the list of live users
};

const handleSocketConnection = (io) => {
  io.on("connection", (socket) => {
    console.log(`New client connected: ${socket.id}`);
  
    onlineUsers.add(socket.id);
  
    io.emit('update-online-users', Array.from(onlineUsers).length);

    // Send current slide position and amount to newly connected clients
    socket.emit('current-position', slidePosition);
    socket.emit('current-slide-amount', slidePositionAmount);

    socket.on("set-initial-vote", (initialVote) => {
      console.log(`Setting initial vote for ${socket.id} to ${initialVote}`);
      slidePosition = initialVote;
      io.emit('vote-update', slidePosition); // Broadcast the initial vote position
    });
  
    socket.on("vote", (newPosition) => {
      slidePosition = newPosition;
      io.emit('vote-update', slidePosition);

      if (slidePosition >= 100) {
        slidePositionAmount /= 2; // Halve the distance each time it reaches 100
        io.emit('current-slide-amount', slidePositionAmount); // Broadcast new slide amount
        extendTimer(socket.id, 60, io, stopLiveStream); // Extend timer by 60 seconds
      } else if (slidePosition <= 0) {
        slidePositionAmount = 5; // Reset slide position amount
        io.emit('current-slide-amount', slidePositionAmount); // Broadcast reset slide amount
        stopLiveStream(socket.id, io); // Kick the main feed
      }
    });
  
    if (liveUsers.size > 0) {
      const currentLiveUser = Array.from(liveUsers)[0];
      socket.emit("main-feed", currentLiveUser);
    }
  
    socket.on("join-queue", () => {
      console.log(`Client ${socket.id} joining queue`);
      liveQueue.push(socket.id);
      if (liveQueue.length === 1) {
        io.to(socket.id).emit("go-live");
      }
    });
  
    socket.on("go-live", () => {
      console.log(`Client ${socket.id} going live`);
      liveUsers.add(socket.id);  // Add user to the live users set
      activeStreams.set(socket.id, socket.id);  // Track active stream
      updateLiveUsers(io);  // Update all clients with the new list of live users
      io.emit('main-feed', socket.id); // Broadcast the live stream id to all clients 
      startTimer(socket.id, io, stopLiveStream);
    });
  
    socket.on("request-offer", (liveUserId) => {
      io.to(liveUserId).emit("new-peer", socket.id);
    });
  
    socket.on("offer", (id, offer) => {
      try {
        socket.to(id).emit("offer", socket.id, offer);
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
      console.log(`Client ${socket.id} stopping live`);
      liveQueue.shift();
      liveUsers.delete(socket.id);  // Remove user from the live users set
      activeStreams.delete(socket.id);
      updateLiveUsers(io);  // Update all clients with the new list of live users
      notifyNextUserInQueue(io);
      io.emit('main-feed', null); // Notify all clients that the live stream has stopped 
      stopTimer(socket.id);
    });
  
    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
      onlineUsers.delete(socket.id);
      const queueIndex = liveQueue.indexOf(socket.id);
      if (queueIndex !== -1) {
        liveQueue.splice(queueIndex, 1);
      }
      if (currentStreamer === socket.id) {
        currentStreamer = null;
        notifyNextUserInQueue(io);
      }
      liveUsers.delete(socket.id);
      activeStreams.delete(socket.id);
      updateLiveUsers(io); 
      stopTimer(socket.id);
      socket.broadcast.emit("peer-disconnected", socket.id);
    });
  });
};

module.exports = {
  handleSocketConnection,
  onlineUsers
};
