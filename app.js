
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const User = require('./models/User');
const multer = require('multer');
const Notes = require('./models/Notes');
const fs = require('fs');
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
const flash = require('connect-flash');

const app = express();
const port = 3009;

mongoose.connect('mongodb://127.0.0.1:27017/notes_sharing', {    useNewUrlParser: true,
    useUnifiedTopology: true,
  }).then(() => {
    console.log('Connected to MongoDB');
  }).catch((err) => {
    console.error('Error connecting to MongoDB:', err);
  });


// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true })); // For parsing form data
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ 
  secret: 'secret_key', 
  resave: false, 
  saveUninitialized: false,
  cookie: { secure: false }  // Make sure this is false if you're not using https for development
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(flash());
app.set('view engine', 'ejs');

// Passport authentication strategy setup (using email instead of username)
passport.use(new LocalStrategy(
    { usernameField: 'email' },  // Specify that 'email' should be used for the username field
    function(email, password, done) {
      User.findOne({ email: email }, function (err, user) {
        if (err) { return done(err); }
        if (!user) {
          return done(null, false, { message: 'Incorrect email.' });
        }
        if (!user.validPassword(password)) {
          return done(null, false, { message: 'Incorrect password.' });
        }
        return done(null, user);
      });
    }
  ));
  
  passport.serializeUser((user, done) => {
    done(null, user.id); // Storing user ID in the session
  });
  
  passport.deserializeUser((id, done) => {
    User.findById(id, (err, user) => {
      done(err, user); // Retrieving user data from the session
    });
  });
  

// Multer setup for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/');  // Save to the 'uploads' folder
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));  // Give the file a unique name
    }
  });
  


  const ensureAuthenticated = (req, res, next) => {
    if (req.session.user) { // Replace `req.isAuthenticated()` with session check
        return next();
    }
    res.redirect('/login');
};


app.get('/', (req, res) => {
  res.render('welcome');
});


app.get('/signup', (req, res) => {
    res.render('signup');
});

app.post('/signup', async (req, res) => {
    const { fullName, email, password, branch, role } = req.body;

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render('signup', { error: 'Email already registered. Please use a different email.' });
        }

        // Create the new user (password will be hashed in the pre-save hook)
        const newUser = new User({
            fullName,
            email,
            password,
            branch,
            role,
        });

        // Save the user to the database
        await newUser.save();

        // Log in the user by setting the session
        req.session.user = newUser;

        // Redirect to dashboard
        return res.redirect('/dashboard');
    } catch (error) {
        console.error(error);
        res.render('signup', { error: 'An error occurred during signup. Please try again.' });
    }
});

// Login Route
app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Find user by email
        const user = await User.findOne({ email });

        if (!user) {
            return res.render('login', { error: 'Invalid email or password' });
        }

        // Compare password with the stored hash
        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            // Store user information in session
            req.session.user = user;

            // Debug log to check if session is set
            console.log('User logged in, session:', req.session);

            // Redirect to dashboard after successful login
            console.log('Redirecting to dashboard...');
            return res.redirect('/dashboard');
        } else {
            return res.render('login', { error: 'Invalid email or password' });
        }
    } catch (error) {
        console.error(error);
        return res.render('login', { error: 'An error occurred during login: ' + error.message });
    }
});

// Dashboard Route
app.get('/dashboard', (req, res) => {
    if (!req.session.user) {  
      
        return res.redirect('/login'); 
    }  
    res.render('dashboard', { user: req.session.user });
});



app.get('/logout', (req, res) => {
    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        console.error('Error while logging out:', err);
        return res.send('An error occurred during logout.');
      }
      // Redirect to the login page
      res.redirect('/login');
    });
  });


  


  const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const fileExtension = path.extname(file.originalname).toLowerCase();
        console.log('File type:', fileExtension);
        if (['.pdf', '.doc', '.docx','.png'].includes(fileExtension)) {
            cb(null, true);
        } else {
            cb(new Error('File type not supported'), false);
        }
    }
});



// Route to show the upload form
app.get('/upload-notes', (req, res) => {
    res.render('upload', { title: 'Upload Notes' });
  });


  
app.post('/upload-notes', upload.single('noteFile'), (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const { branch, subject, description } = req.body;
    const filePath = req.file ? req.file.path : null;

    if (!filePath) {
        return res.status(400).send('No file uploaded.');
    }
    console.log('File uploaded:', filePath); // Log the file path for debugging

    const newNote = new Notes({
        branch,
        subject,
        description,
        file: filePath,
        uploadedBy: req.session.user._id
    });

    newNote.save()
        .then(() => {
            res.redirect('/dashboard');
        })
        .catch((err) => {
            console.error('Error saving note:', err);
            res.status(500).send('Error saving note.');
        });
});

app.get('/view-my-notes', ensureAuthenticated, async (req, res) => {
  console.log('Session User:', req.session.user); // Debug session data
  try {
      const notes = await Notes.find({ uploadedBy: req.session.user._id });
      res.render('view-my-notes', { username: req.session.user.fullName, notes });
  } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
  }
});

app.get('/download/:id', ensureAuthenticated, async (req, res) => {
  try {
      const note = await Notes.findById(req.params.id);

      if (!note) {
          return res.status(404).send('File not found');
      }

       /*
      if (note.uploadedBy.toString() !== req.session.user._id) {
          return res.status(403).send('Access denied');
      }*/

      const filePath = path.join(__dirname, 'uploads', path.basename(note.file));

      if (!fs.existsSync(filePath)) {
          return res.status(404).send('File not found');
      }

      res.download(filePath, (err) => {
          if (err) {
              console.error('Error during file download:', err);
              res.status(500).send('Server Error');
          }
      });
  } catch (err) {
      console.error('Unexpected error:', err);
      res.status(500).send('Server Error');
  }
});




// Route to view all notes
app.get('/view-all-notes', async (req, res) => {
  try {
      // Fetch notes from the database using await
      const notes = await Notes.find({}).populate('uploadedBy', 'fullName');
      res.render('view-all-notes', { notes, error: null }); // Pass error as null if no error
  } catch (err) {
      console.error('Error fetching notes:', err);
      res.render('view-all-notes', { notes: [], error: 'Error fetching notes' }); // Pass error message
  }
});








app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
