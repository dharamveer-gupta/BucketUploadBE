const express = require('express');
const uploadController = require('./controllers/uploadController');

const app = express();
app.use(express.json());

app.use('/api', uploadController);

const PORT = process.env.PORT || 3111;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});