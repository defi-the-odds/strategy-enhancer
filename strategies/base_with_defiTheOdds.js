/**
 * This file is a base strategy using golden cross and death cross, copy this file to create a new strategy
 */

const strategySettings = {
    stopLossPercentage: 0.02,
    takeProfitPercentage: 0.05,
    longEntryMaxRSI: 70,
    shortEntryMinRSI: 30,
    longExitMinRSI: 30,
    shortExitMaxRSI: 70,
    entryMinHighVol: 0.0,
    entryMinExpProb: 0.6
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

function meetsDefiTheOddsEntryCriteria(candle) {
    // return candle.high_vol_conf > strategySettings.entryMinHighVol
    //     && candle.expansion_probability > strategySettings.entryMinExpProb;
    return candle.expansion_probability > strategySettings.entryMinExpProb;
}

function checkEntryCriteria(candle, data, index) {
    if (index < 1) {
        return null;
    }

    // check if the golden cross is present
    if (data[index - 1].sma_50 < data[index - 1].sma_200 && data[index].sma_50 > data[index].sma_200) {
        if (candle.rsi_14 <= strategySettings.longEntryMaxRSI && meetsDefiTheOddsEntryCriteria(candle)) {
            return createPosition('long', candle.close);
        }
    } else if (data[index - 1].sma_50 > data[index - 1].sma_200 && data[index].sma_50 < data[index].sma_200) {
        if (candle.rsi_14 >= strategySettings.shortEntryMinRSI && meetsDefiTheOddsEntryCriteria(candle)) {
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
