/**
 * This file is a base strategy using golden cross and death cross, copy this file to create a new strategy
 */

const strategySettings = {
    stopLossPercentage: 0.02,
    takeProfitPercentage: 0.05,
    longEntryMaxRSI: 70,
    shortEntryMinRSI: 30,
    longExitMinRSI: 30,
    shortExitMaxRSI: 70
};

// in memory storage for the position
let position = {
    size: 0,
    direction: 'long',
    entryPrice: 0,
    exitPrice: 0,
    stopLossPrice: 0,
    takeProfitPrice: 0,
    profit: 0,
    loss: 0,
    win: false
};

function resetPosition() {
    position.direction = 'long';
    position.size = 0;
    position.entryPrice = 0;
    position.exitPrice = 0;
    position.stopLossPrice = 0;
    position.takeProfitPrice = 0;
    position.profit = 0;
    position.loss = 0;
    position.win = false;
}

function createPosition(direction, entryPrice) {
    resetPosition();
    position.direction = direction;
    position.size = 1;
    position.entryPrice = entryPrice;

    if (direction === 'long') {
        position.stopLossPrice = entryPrice * (1 - strategySettings.stopLossPercentage);
        position.takeProfitPrice = entryPrice * (1 + strategySettings.takeProfitPercentage);
    } else {
        position.stopLossPrice = entryPrice * (1 + strategySettings.stopLossPercentage);
        position.takeProfitPrice = entryPrice * (1 - strategySettings.takeProfitPercentage);
    }

    return position;
}

function checkEntryCriteria(candle, data, index) {
    if (index < 1) {
        return null;
    }

    // check if the golden cross is present
    if (data[index - 1].sma_50 < data[index - 1].sma_200 && data[index].sma_50 > data[index].sma_200) {
        if (candle.rsi_14 <= strategySettings.longEntryMaxRSI) {
            return createPosition('long', candle.close);
        }
    } else if (data[index - 1].sma_50 > data[index - 1].sma_200 && data[index].sma_50 < data[index].sma_200) {
        if (candle.rsi_14 >= strategySettings.shortEntryMinRSI) {
            return createPosition('short', candle.close);
        }
    }

    return null;
}

function checkExitCriteria(candle, data, index) {
    if (position.size === 0 || index < 1) {
        return null;
    }

    // exit when RSI crosses the directional threshold
    if (position.direction === 'long') {
        if (candle.rsi_14 < strategySettings.longExitMinRSI) {
            const reason = 'Long RSI below exit minimum: ' + candle.rsi_14;
            position.exitPrice = candle.close;
            return { position, reason };
        }
    } else if (position.direction === 'short') {
        if (candle.rsi_14 > strategySettings.shortExitMaxRSI) {
            const reason = 'Short RSI above exit maximum: ' + candle.rsi_14;
            position.exitPrice = candle.close;
            return { position, reason };
        }
    }

    // check if the death cross is present
    if (position.direction === 'long') {
        if (data[index - 1].sma_50 > data[index - 1].sma_200 && data[index].sma_50 < data[index].sma_200) {
            const reason = 'Death cross detected, exiting long position';
            position.exitPrice = candle.close;
            return { position, reason };
        }
    } else if (position.direction === 'short') {
        if (data[index - 1].sma_50 < data[index - 1].sma_200 && data[index].sma_50 > data[index].sma_200) {
            const reason = 'Golden cross detected, exiting short position';
            position.exitPrice = candle.close;
            return { position, reason };
        }
    }

    return null;
}

module.exports = {
    checkEntryCriteria,
    checkExitCriteria,
    resetPosition,
    isInPosition: () => position.size > 0
};

/*
Sample Defi The Odds API Response per candle:
{
      "ticker": "BTC-USD",
      "datetime": "2026-06-08T14:00:00+00:00",
      "vwap": 63359.92,
      "open": 63721.26,
      "high": 64049.12,
      "low": 63542.76,
      "close": 63919.03,
      "volume": 1801543680,
      "sma_50": 62098.34,
      "sma_200": 65662.01,
      "ema_20": 63072.47,
      "ema_50": 62528.76,
      "ema_200": 65274.53,
      "rsi_14": 64.7605,
      "macd_line": 443.9116,
      "macd_hist": 49.3253,
      "macd_signal": 394.5863,
      "adx_14": 26.8087,
      "dmp_14": 2107.42,
      "dmn_14": 1141.17,
      "stochrsik": 76.1728,
      "stochrsid": 60.8333,
      "atr_14": 601.2388,
      "bbl_low": 61665.53,
      "bbm_mid": 63003.03,
      "bbu_up": 64340.53,
      "candle": null,
      "market_regime_score": 50.8,
      "future_vol": 0.0044,
      "expansion_probability": 0.1118,
      "tail_risk": 0,
      "tail_risk_conf": 0.223,
      "high_vol": 1,
      "high_vol_conf": 0.944,
      "regime_change": 0,
      "regime_change_conf": 0,
      "regime_emergence": 0,
      "regime_emergence_conf": 0.085,
      "breakout": 1,
      "breakout_conf": 0.6
    }
*/
