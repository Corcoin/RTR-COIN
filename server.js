const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;
const axios = require('axios');
const cheerio = require('cheerio');
const fetchAluminumPrice = require('./scrapeAluminumPrice'); // Import the scraping function
const cors = require('cors');

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(cors({
    origin: 'https://www.rantripple.com' // Allow requests from this origin
}));

app.get('/aluminum-price', async (req, res) => {
    try {
        const price = await fetchAluminumPrice();
        if (price) {
            res.json({ success: true, price });
        } else {
            res.status(500).json({ success: false, message: 'Failed to fetch price' });
        }
    } catch (error) {
        console.error('Error fetching aluminum price:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});


// File paths
const DATA_FILE = path.join(__dirname, 'data', 'currency_data.json');
const TRANSACTION_FILE = path.join(__dirname, 'data', 'transactions.txt');

// Initialize storage if not already
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

// Add a new user
app.post('/addUser', (req, res) => {
    const { username } = req.body;
    let users;

    try {
        users = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error reading data file.' });
    }

    if (!Array.isArray(users)) {
        return res.status(500).json({ success: false, message: 'Invalid data format in file.' });
    }

    if (users.find(user => user.username === username)) {
        return res.status(400).json({ success: false, message: 'User already exists!' });
    }

    users.push({ username, balance: 0, wallet: 0, lastAdded: null });
    fs.writeFileSync(DATA_FILE, JSON.stringify(users));
    res.json({ success: true, message: 'User added successfully!' });
});

// Deposit funds to a user
app.post('/deposit', (req, res) => {
    const { username, amount } = req.body;
    let users;

    try {
        users = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error reading data file.' });
    }

    let user = users.find(user => user.username === username);
    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found!' });
    }

    user.balance += amount;
    fs.writeFileSync(DATA_FILE, JSON.stringify(users));
    logTransaction(`Deposited ${amount} to ${username}`);
    res.json({ success: true });
});

// Transfer funds between users
app.post('/transfer', (req, res) => {
    const { fromUser, toUser, amount } = req.body;
    let users;

    try {
        users = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error reading data file.' });
    }

    let from = users.find(user => user.username === fromUser);
    let to = users.find(user => user.username === toUser);

    if (!from || !to) {
        return res.status(404).json({ success: false, message: 'User(s) not found!' });
    }
    if (from.balance < amount) {
        return res.status(400).json({ success: false, message: 'Insufficient funds!' });
    }
    from.balance -= amount;
    to.balance += amount;
    fs.writeFileSync(DATA_FILE, JSON.stringify(users));
    logTransaction(`Transferred ${amount} from ${fromUser} to ${toUser}`);
    res.json({ success: true });
});

// View wallet balance
app.get('/wallet/:username', (req, res) => {
    const { username } = req.params;
    let users;

    try {
        users = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error reading data file.' });
    }

    let user = users.find(user => user.username === username);
    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found!' });
    }
    res.json({ success: true, balance: user.wallet });
});

// Add funds to wallet
app.post('/addToWallet', (req, res) => {
    const { username, amount } = req.body;
    let users;

    try {
        users = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error reading data file.' });
    }

    let user = users.find(user => user.username === username);
    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found!' });
    }

    const now = new Date();
    const lastAdded = user.lastAdded ? new Date(user.lastAdded) : null;
    const daysElapsed = lastAdded ? Math.floor((now - lastAdded) / (1000 * 60 * 60 * 24)) : 30;

    if (daysElapsed < 30 && amount + user.wallet > 100) {
        return res.status(400).json({ success: false, message: 'Monthly limit of $100 exceeded!' });
    }

    if (daysElapsed >= 30) {
        user.wallet = 0; // Reset wallet if new month
    }

    user.wallet += amount;
    user.lastAdded = now.toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(users));
    logTransaction(`Added ${amount} to ${username}'s wallet`);
    res.json({ success: true });
});

// List all users
app.get('/users', (req, res) => {
    let users;

    try {
        users = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (error) {
        console.error('Error reading or parsing file:', error);
        return res.status(500).json({ success: false, message: 'Error reading data file.' });
    }

    res.json(users);
});

// Serve currency data
app.get('/currencyData', (req, res) => {
    res.sendFile(DATA_FILE);
});

// Serve transaction log
app.get('/transactions', (req, res) => {
    res.sendFile(TRANSACTION_FILE);
});

// Log transactions
function logTransaction(message) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(TRANSACTION_FILE, `${timestamp} - ${message}\n`, 'utf8');
}

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
