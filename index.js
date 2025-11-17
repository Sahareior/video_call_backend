require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);

// Configure Socket.IO with CORS
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/videocallingapp', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Import models and routes
const User = require('./models/User');
const Room = require('./models/Room');
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Video Calling API Server Running' });
});

// Store active rooms and users
const activeRooms = new Map();
const userSockets = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('👤 User connected:', socket.id);

  // Join room
  socket.on('join-room', async (data) => {
    const { roomId, userName } = data;
    
    try {
      // Verify room exists
      const room = await Room.findById(roomId);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Leave any previous room
      const previousRoom = socket.roomId;
      if (previousRoom) {
        socket.leave(previousRoom);
        if (activeRooms.has(previousRoom)) {
          const roomUsers = activeRooms.get(previousRoom);
          roomUsers.delete(socket.id);
          if (roomUsers.size === 0) {
            activeRooms.delete(previousRoom);
          } else {
            activeRooms.set(previousRoom, roomUsers);
            socket.to(previousRoom).emit('user-left', { socketId: socket.id });
          }
        }
      }

      // Join new room
      socket.join(roomId);
      socket.roomId = roomId;
      socket.userName = userName;

      // Add user to room
      if (!activeRooms.has(roomId)) {
        activeRooms.set(roomId, new Map());
      }
      const roomUsers = activeRooms.get(roomId);
      roomUsers.set(socket.id, { userName, socketId: socket.id });
      activeRooms.set(roomId, roomUsers);

      // Send current users in room to the new user
      const usersInRoom = Array.from(roomUsers.values());
      socket.emit('room-users', { users: usersInRoom });

      // Notify others about new user
      socket.to(roomId).emit('user-joined', { 
        userName, 
        socketId: socket.id 
      });

      // Update room participant count
      await Room.findByIdAndUpdate(roomId, {
        participants: roomUsers.size
      });

    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // WebRTC signaling
  socket.on('offer', (data) => {
    const { targetSocketId, offer } = data;
    socket.to(targetSocketId).emit('offer', {
      offer,
      senderSocketId: socket.id,
      senderUserName: socket.userName
    });
  });

  socket.on('answer', (data) => {
    const { targetSocketId, answer } = data;
    socket.to(targetSocketId).emit('answer', {
      answer,
      senderSocketId: socket.id
    });
  });

  socket.on('ice-candidate', (data) => {
    const { targetSocketId, candidate } = data;
    socket.to(targetSocketId).emit('ice-candidate', {
      candidate,
      senderSocketId: socket.id
    });
  });

  // Screen sharing
  socket.on('screen-share-started', () => {
    socket.to(socket.roomId).emit('screen-share-started', {
      socketId: socket.id,
      userName: socket.userName
    });
  });

  socket.on('screen-share-stopped', () => {
    socket.to(socket.roomId).emit('screen-share-stopped', {
      socketId: socket.id
    });
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    console.log('👤 User disconnected:', socket.id);
    
    // Remove user from room
    if (socket.roomId && activeRooms.has(socket.roomId)) {
      const roomUsers = activeRooms.get(socket.roomId);
      roomUsers.delete(socket.id);
      
      if (roomUsers.size === 0) {
        activeRooms.delete(socket.roomId);
        // Optionally delete empty room from database
        await Room.findByIdAndDelete(socket.roomId);
      } else {
        activeRooms.set(socket.roomId, roomUsers);
        socket.to(socket.roomId).emit('user-left', { 
          socketId: socket.id,
          userName: socket.userName 
        });
        
        // Update room participant count
        await Room.findByIdAndUpdate(socket.roomId, {
          participants: roomUsers.size
        });
      }
    }
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 WebSocket server ready for connections`);
});