const Client = require('../models/Client');

// Add a new client
const addClient = async (req, res) => {
  const { name, email, phone } = req.body;

  try {
    const client = new Client({ name, email, phone });
    await client.save();
    res.status(201).json(client);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get all clients
const getClients = async (req, res) => {
  try {
    const clients = await Client.find();
    res.status(200).json(clients);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get a single client by ID
const getClientById = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    res.status(200).json(client);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update a client
const updateClient = async (req, res) => {
  const { name, email, phone } = req.body;

  try {
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { name, email, phone },
      { new: true, runValidators: true }
    );

    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    res.status(200).json(client);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete a client
const deleteClient = async (req, res) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);

    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    res.status(200).json({ message: 'Client deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  addClient,
  getClients,
  getClientById,
  updateClient,
  deleteClient
};
