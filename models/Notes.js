// models/Notes.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const noteSchema = new Schema({
  branch: {
    type: String,
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  file: {
    type: String, // Path to the file
    required: true
  },
  uploadDate: {
    type: Date,
    default: Date.now
  },
  uploadedBy: {
    type: Schema.Types.ObjectId,  // Reference to the User model
    ref: 'User',  // Name of the User model
    required: true
  }
});

const Notes = mongoose.model('Notes', noteSchema);

module.exports = Notes;
