const express = require('express');
const jwt = require('jsonwebtoken');
const Room = require('../models/Room');
const User = require('../models/User');

const router = express.Router();

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ 
      message: 'Access token required' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ 
        message: 'Invalid token' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ 
      message: 'Invalid token' 
    });
  }
};

// Create new room
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { 
      name, 
      description, 
      isPublic, 
      password, 
      maxParticipants, 
      settings 
    } = req.body;

    // Validation
    if (!name) {
      return res.status(400).json({ 
        message: 'Room name is required' 
      });
    }

    if (maxParticipants && (maxParticipants < 2 || maxParticipants > 50)) {
      return res.status(400).json({ 
        message: 'Max participants must be between 2 and 50' 
      });
    }

    // Create room
    const room = new Room({
      name: name.trim(),
      description: description?.trim() || '',
      host: req.user._id,
      isPublic: isPublic !== undefined ? isPublic : true,
      password: password || null,
      maxParticipants: maxParticipants || 10,
      settings: {
        allowScreenShare: settings?.allowScreenShare !== false,
        allowChat: settings?.allowChat !== false,
        allowRecording: settings?.allowRecording || false,
        muteOnJoin: settings?.muteOnJoin || false,
        videoOffOnJoin: settings?.videoOffOnJoin || false
      }
    });

    await room.save();
    await room.populate('host', 'username email');

    res.status(201).json({
      message: 'Room created successfully',
      room: {
        id: room._id,
        roomId: room.roomId,
        name: room.name,
        description: room.description,
        host: {
          id: room.host._id,
          username: room.host.username
        },
        isPublic: room.isPublic,
        maxParticipants: room.maxParticipants,
        participants: room.participants,
        settings: room.settings,
        roomUrl: room.roomUrl,
        createdAt: room.createdAt
      }
    });

  } catch (error) {
    console.error('Room creation error:', error);
    res.status(500).json({ 
      message: 'Server error during room creation' 
    });
  }
});

// Get user's rooms
router.get('/my-rooms', authenticateToken, async (req, res) => {
  try {
    const rooms = await Room.find({ 
      host: req.user._id,
      isActive: true 
    })
    .sort({ createdAt: -1 })
    .populate('host', 'username email');

    const formattedRooms = rooms.map(room => ({
      id: room._id,
      roomId: room.roomId,
      name: room.name,
      description: room.description,
      host: {
        id: room.host._id,
        username: room.host.username
      },
      isPublic: room.isPublic,
      maxParticipants: room.maxParticipants,
      participants: room.participants,
      settings: room.settings,
      roomUrl: room.roomUrl,
      createdAt: room.createdAt,
      isActive: room.isActive
    }));

    res.json({
      rooms: formattedRooms
    });

  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ 
      message: 'Server error while fetching rooms' 
    });
  }
});

// Get room by roomId (for joining)
router.get('/room/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    
    const room = await Room.findOne({ 
      roomId,
      isActive: true 
    }).populate('host', 'username email');

    if (!room) {
      return res.status(404).json({ 
        message: 'Room not found' 
      });
    }

    // If room is private, check if user has token
    if (!room.isPublic) {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({ 
          message: 'Authentication required for private room' 
        });
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        await User.findById(decoded.userId);
      } catch (error) {
        return res.status(401).json({ 
          message: 'Invalid authentication token' 
        });
      }
    }

    res.json({
      room: {
        id: room._id,
        roomId: room.roomId,
        name: room.name,
        description: room.description,
        host: {
          id: room.host._id,
          username: room.host.username
        },
        isPublic: room.isPublic,
        maxParticipants: room.maxParticipants,
        participants: room.participants,
        settings: room.settings,
        roomUrl: room.roomUrl,
        createdAt: room.createdAt,
        requiresAuth: !room.isPublic
      }
    });

  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ 
      message: 'Server error while fetching room' 
    });
  }
});

// Get public rooms
router.get('/public', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const skip = (page - 1) * limit;

    const rooms = await Room.find({ 
      isPublic: true,
      isActive: true 
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate('host', 'username email');

    const totalRooms = await Room.countDocuments({ 
      isPublic: true,
      isActive: true 
    });

    const formattedRooms = rooms.map(room => ({
      id: room._id,
      roomId: room.roomId,
      name: room.name,
      description: room.description,
      host: {
        id: room.host._id,
        username: room.host.username
      },
      maxParticipants: room.maxParticipants,
      participants: room.participants,
      settings: room.settings,
      roomUrl: room.roomUrl,
      createdAt: room.createdAt
    }));

    res.json({
      rooms: formattedRooms,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalRooms / limit),
        totalRooms,
        hasNext: skip + rooms.length < totalRooms
      }
    });

  } catch (error) {
    console.error('Get public rooms error:', error);
    res.status(500).json({ 
      message: 'Server error while fetching public rooms' 
    });
  }
});

// Update room
router.put('/:roomId', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const updates = req.body;

    const room = await Room.findOne({ 
      roomId,
      host: req.user._id 
    });

    if (!room) {
      return res.status(404).json({ 
        message: 'Room not found or you are not the host' 
      });
    }

    // Update allowed fields
    const allowedUpdates = ['name', 'description', 'isPublic', 'password', 'maxParticipants', 'settings'];
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        if (key === 'settings') {
          room.settings = { ...room.settings, ...updates.settings };
        } else {
          room[key] = updates[key];
        }
      }
    });

    await room.save();
    await room.populate('host', 'username email');

    res.json({
      message: 'Room updated successfully',
      room: {
        id: room._id,
        roomId: room.roomId,
        name: room.name,
        description: room.description,
        host: {
          id: room.host._id,
          username: room.host.username
        },
        isPublic: room.isPublic,
        maxParticipants: room.maxParticipants,
        participants: room.participants,
        settings: room.settings,
        roomUrl: room.roomUrl,
        updatedAt: room.updatedAt
      }
    });

  } catch (error) {
    console.error('Update room error:', error);
    res.status(500).json({ 
      message: 'Server error while updating room' 
    });
  }
});

// Delete room
router.delete('/:roomId', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findOne({ 
      roomId,
      host: req.user._id 
    });

    if (!room) {
      return res.status(404).json({ 
        message: 'Room not found or you are not the host' 
      });
    }

    room.isActive = false;
    room.endedAt = new Date();
    await room.save();

    res.json({ 
      message: 'Room deleted successfully' 
    });

  } catch (error) {
    console.error('Delete room error:', error);
    res.status(500).json({ 
      message: 'Server error while deleting room' 
    });
  }
});

module.exports = router;