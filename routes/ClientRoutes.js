const express = require('express');
const router = express.Router();
const {
  addClient,
  getClients,
  getClientById,
  updateClient,
  deleteClient
} = require('../controllers/clientController');

router.post('/add', addClient); // Add a new client
router.get('/', getClients); // Get all clients
router.get('/:id', getClientById); // Get client by ID
router.put('/:id', updateClient); // Update client
router.delete('/:id', deleteClient); // Delete client

module.exports = router;
