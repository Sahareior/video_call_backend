const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    unique: true,
    required: true,
    default: () => uuidv4()
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  password: {
    type: String,
    default: null
  },
  maxParticipants: {
    type: Number,
    default: 10,
    min: 2,
    max: 50
  },
  participants: {
    type: Number,
    default: 0
  },
  settings: {
    allowScreenShare: {
      type: Boolean,
      default: true
    },
    allowChat: {
      type: Boolean,
      default: true
    },
    allowRecording: {
      type: Boolean,
      default: false
    },
    muteOnJoin: {
      type: Boolean,
      default: false
    },
    videoOffOnJoin: {
      type: Boolean,
      default: false
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  endedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Generate room ID before saving
roomSchema.pre('save', function(next) {
  if (!this.roomId) {
    this.roomId = uuidv4();
  }
  next();
});

// Virtual for room URL
roomSchema.virtual('roomUrl').get(function() {
  return `/room/${this.roomId}`;
});

// Index for efficient queries
roomSchema.index({ roomId: 1 });
roomSchema.index({ host: 1 });
roomSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model('Room', roomSchema);