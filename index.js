// index.js
// Simple demo: AI-like contamination predictor + minimal blockchain store
// Run: node index.js
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

/* -------------------------
   Minimal Blockchain class
   ------------------------- */
class Block {
  constructor(index, timestamp, data, previousHash = '') {
    this.index = index;
    this.timestamp = timestamp;
    this.data = data; // arbitrary JSON
    this.previousHash = previousHash;
    this.nonce = 0;
    this.hash = this.calculateHash();
  }
  calculateHash() {
    return crypto
      .createHash('sha256')
      .update(String(this.index) + this.previousHash + this.timestamp + JSON.stringify(this.data) + this.nonce)
      .digest('hex');
  }
  // Simple proof-of-work to demonstrate immutability
  mine(difficulty) {
    const target = '0'.repeat(difficulty);
    while (!this.hash.startsWith(target)) {
      this.nonce++;
      this.hash = this.calculateHash();
    }
  }
}

class Blockchain {
  constructor() {
    this.chain = [this.createGenesisBlock()];
    this.difficulty = 2; // low difficulty for demo
  }
  createGenesisBlock() {
    const g = new Block(0, new Date().toISOString(), { info: 'genesis' }, '0');
    g.hash = g.calculateHash();
    return g;
  }
  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }
  addBlock(newBlock) {
    newBlock.previousHash = this.getLatestBlock().hash;
    newBlock.index = this.getLatestBlock().index + 1;
    newBlock.mine(this.difficulty);
    this.chain.push(newBlock);
    return newBlock;
  }
  isValid() {
    for (let i = 1; i < this.chain.length; i++) {
      const cur = this.chain[i];
      const prev = this.chain[i - 1];
      if (cur.hash !== cur.calculateHash()) return false;
      if (cur.previousHash !== prev.hash) return false;
    }
    return true;
  }
  // utility: find all records for a productId
  findByProduct(productId) {
    return this.chain
      .slice(1) // ignore genesis
      .map(b => b.data)
      .filter(d => d.productId === productId);
  }
}

const foodChain = new Blockchain();

/* -------------------------
   Simple AI predictor
   (rule-based scoring)
   ------------------------- */
function predictContaminationRisk(sensor) {
  // sensor: { temp, humidity, pH, bacterialCount }
  // We assign weights to each and compute a score (0-100)
  const w = { temp: 0.30, humidity: 0.20, pH: 0.15, bacterialCount: 0.35 };

  // Normalize each metric into a 0-100 danger score (higher = worse)
  // These normalization heuristics are simple for demo only!
  const tempDanger = Math.max(0, Math.min(100, ((sensor.temp - 4) / (40 - 4)) * 100)); // ideal refrigeration ~4°C
  const humidityDanger = Math.max(0, Math.min(100, (sensor.humidity / 100) * 100));
  const pHDanger = Math.max(0, Math.min(100, (Math.abs(sensor.pH - 6.5) / 4) * 100)); // pH drift from ideal 6.5
  const bacteriaDanger = Math.max(0, Math.min(100, (sensor.bacterialCount / 1000000) * 100)); // assumes scale up to 1e6

  const score =
    tempDanger * w.temp +
    humidityDanger * w.humidity +
    pHDanger * w.pH +
    bacteriaDanger * w.bacterialCount;

  // Map numeric score to category and return reasons (explainability)
  let category = 'Low';
  if (score >= 60) category = 'High';
  else if (score >= 30) category = 'Medium';

  // Build reasons for top contributors
  const contributions = [
    { name: 'temp', val: tempDanger * w.temp },
    { name: 'humidity', val: humidityDanger * w.humidity },
    { name: 'pH', val: pHDanger * w.pH },
    { name: 'bacterialCount', val: bacteriaDanger * w.bacterialCount },
  ];
  contributions.sort((a, b) => b.val - a.val);
  const topReasons = contributions.slice(0, 2).map(c => `${c.name} (impact ${c.val.toFixed(1)})`);

  return {
    score: Number(score.toFixed(2)),
    category,
    reasons: topReasons,
    raw: { tempDanger, humidityDanger, pHDanger, bacteriaDanger },
  };
}

/* -------------------------
   API Endpoints
   ------------------------- */

// Health
app.get('/', (req, res) => {
  res.send({ ok: true, info: 'Food chain demo: AI predictor + local blockchain' });
});

// POST data -> predict and store on blockchain
app.post('/data', (req, res) => {
  try {
    const body = req.body;
    // Required fields check (basic)
    const required = ['productId', 'temp', 'humidity', 'pH', 'bacterialCount', 'location'];
    for (const f of required) {
      if (typeof body[f] === 'undefined') {
        return res.status(400).json({ error: `missing field ${f}` });
      }
    }

    // Run predictor
    const prediction = predictContaminationRisk({
      temp: Number(body.temp),
      humidity: Number(body.humidity),
      pH: Number(body.pH),
      bacterialCount: Number(body.bacterialCount),
    });

    // Compose record
    const record = {
      productId: String(body.productId),
      timestamp: new Date().toISOString(),
      sensor: {
        temp: Number(body.temp),
        humidity: Number(body.humidity),
        pH: Number(body.pH),
        bacterialCount: Number(body.bacterialCount),
      },
      location: body.location,
      prediction,
      notes: body.notes || '',
    };

    // Add to blockchain
    const newBlock = foodChain.addBlock(new Block(null, new Date().toISOString(), record, null));
    res.json({
      message: 'Data recorded and secured on blockchain',
      block: {
        index: newBlock.index,
        hash: newBlock.hash,
        previousHash: newBlock.previousHash,
        timestamp: newBlock.timestamp,
      },
      prediction,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// Get full chain
app.get('/chain', (req, res) => {
  res.json({
    length: foodChain.chain.length,
    valid: foodChain.isValid(),
    chain: foodChain.chain,
  });
});

// Validate chain
app.get('/validate', (req, res) => {
  res.json({ valid: foodChain.isValid() });
});

// Query records for a product
app.get('/product/:id', (req, res) => {
  const id = req.params.id;
  const records = foodChain.findByProduct(id);
  res.json({ productId: id, count: records.length, records });
});

/* -------------------------
   Start server
   ------------------------- */
app.listen(PORT, () => {
  console.log(`FoodChain demo listening at http://localhost:${PORT}`);
});
