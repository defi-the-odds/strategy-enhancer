const dotenv = require('dotenv');
dotenv.config();

const dtoApiKey = process.env.DEFI_THE_ODDS_API_KEY;
const timeframe = process.env.TIMEFRAME || 'hourly';
const candles = Number(process.env.CANDLES) || 15000;

const engine = require('./engine');

engine.run(dtoApiKey, timeframe, candles).catch((error) => {
    console.error('Backtest failed:', error.message);
});

