/**
 * This file is the engine to run the backtest and output the strategy performance metrics
 * It will:
 * - Get the data from the API
 * - Run the backtest
 * - Output the strategy performance metrics
 */

const axios = require('axios');
const ticker = 'ETH-USD';
// CHANGE THIS TO THE STRATEGY YOU WANT TO USE
const strategy = require('./strategies/base');
// const strategy = require('./strategies/base_with_defiTheOdds');

const INITIAL_CAPITAL = 10000;
const RISK_FREE_RATE = 0;

let openPosition = null;

const results = {
    totalTrades: 0,
    totalWins: 0,
    totalLosses: 0,
    totalProfit: 0,
    totalLoss: 0,
    maxDrawdown: 0,
    biggestWin: 0,
    biggestLoss: 0,
    sortinoRatio: 0,
    sharpeRatio: 0,
    calmarRatio: 0,
    returnOnInvestmentPercentage: 0,
    winRate: 0,
    averageWin: 0,
    averageLoss: 0,
    profitFactor: 0,
    finalEquity: INITIAL_CAPITAL,
    trades: []
};

const run = async (dtoApiKey, timeframe, candles) => {
    if (!dtoApiKey) {
        console.error('Missing DEFI_THE_ODDS_API_KEY. Copy example.env to .env and add your API key.');
        return;
    }

    try {
        const response = await axios.get(
            `https://api.defitheodds.xyz/v1/${timeframe}/${ticker}/${candles}`,
            {
                headers: {
                    'x-api-key': dtoApiKey
                }
            }
        );
        runBacktest(response.data.data, { timeframe, candles });
    } catch (error) {
        console.error('Failed to fetch market data:', error.response?.data || error.message);
    }
};

function runBacktest(data, meta) {
    resetResults();

    if (!Array.isArray(data) || data.length === 0) {
        console.error('No candle data returned from API.');
        return results;
    }

    // API returns candles newest-first; backtest needs oldest-first chronological order
    const candles = [...data].sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

    for (let i = 0; i < candles.length; i++) {
        runIteration(candles[i], candles, i);
    }

    // Close any open position at the last candle's close
    if (openPosition) {
        closePosition({
            position: openPosition,
            reason: 'End of backtest period'
        }, candles[candles.length - 1]);
    }

    computeMetrics();
    const signalStats = analyzeEntrySignals(candles);
    logPerformanceReport(candles, meta, signalStats);
    return results;
}

function analyzeEntrySignals(candles) {
    let goldenCrosses = 0;
    let deathCrosses = 0;
    let qualifiedEntries = 0;

    for (let i = 1; i < candles.length; i++) {
        const prev = candles[i - 1];
        const cur = candles[i];

        if (prev.sma_50 < prev.sma_200 && cur.sma_50 > cur.sma_200) {
            goldenCrosses++;
        }
        if (prev.sma_50 > prev.sma_200 && cur.sma_50 < cur.sma_200) {
            deathCrosses++;
        }

        strategy.resetPosition();
        if (strategy.checkEntryCriteria(cur, candles, i)) {
            qualifiedEntries++;
        }
    }

    strategy.resetPosition();

    return { goldenCrosses, deathCrosses, qualifiedEntries };
}

function resetResults() {
    openPosition = null;
    strategy.resetPosition();

    results.totalTrades = 0;
    results.totalWins = 0;
    results.totalLosses = 0;
    results.totalProfit = 0;
    results.totalLoss = 0;
    results.maxDrawdown = 0;
    results.biggestWin = 0;
    results.biggestLoss = 0;
    results.sortinoRatio = 0;
    results.sharpeRatio = 0;
    results.calmarRatio = 0;
    results.returnOnInvestmentPercentage = 0;
    results.winRate = 0;
    results.averageWin = 0;
    results.averageLoss = 0;
    results.profitFactor = 0;
    results.finalEquity = INITIAL_CAPITAL;
    results.trades = [];
}

function checkIfInPosition() {
    return openPosition !== null && openPosition.size > 0;
}

function enterPosition(position) {
    openPosition = position;
}

function checkIfHitSLOrTP(candle) {
    if (!openPosition) {
        return null;
    }

    const { direction, stopLossPrice, takeProfitPrice } = openPosition;

    if (direction === 'long') {
        const hitStopLoss = candle.low <= stopLossPrice;
        const hitTakeProfit = candle.high >= takeProfitPrice;

        if (hitStopLoss && hitTakeProfit) {
            // Assume stop loss hit first when both trigger on the same candle
            openPosition.exitPrice = stopLossPrice;
            return { reason: 'Stop loss hit' };
        }
        if (hitStopLoss) {
            openPosition.exitPrice = stopLossPrice;
            return { reason: 'Stop loss hit' };
        }
        if (hitTakeProfit) {
            openPosition.exitPrice = takeProfitPrice;
            return { reason: 'Take profit hit' };
        }
    } else {
        const hitStopLoss = candle.high >= stopLossPrice;
        const hitTakeProfit = candle.low <= takeProfitPrice;

        if (hitStopLoss && hitTakeProfit) {
            openPosition.exitPrice = stopLossPrice;
            return { reason: 'Stop loss hit' };
        }
        if (hitStopLoss) {
            openPosition.exitPrice = stopLossPrice;
            return { reason: 'Stop loss hit' };
        }
        if (hitTakeProfit) {
            openPosition.exitPrice = takeProfitPrice;
            return { reason: 'Take profit hit' };
        }
    }

    return null;
}

function calculatePnlPercent(position) {
    if (position.direction === 'long') {
        return (position.exitPrice - position.entryPrice) / position.entryPrice;
    }
    return (position.entryPrice - position.exitPrice) / position.entryPrice;
}

function closePosition(exitInfo, candle) {
    const position = { ...exitInfo.position };
    position.exitReason = exitInfo.reason;
    position.exitDatetime = candle.datetime;

    if (!position.exitPrice) {
        position.exitPrice = candle.close;
    }

    const pnlPercent = calculatePnlPercent(position);
    const pnlAmount = INITIAL_CAPITAL * pnlPercent;

    position.pnlPercent = pnlPercent;
    position.pnlAmount = pnlAmount;
    position.win = pnlPercent > 0;

    if (position.win) {
        results.totalWins++;
        results.totalProfit += pnlAmount;
        results.biggestWin = Math.max(results.biggestWin, pnlAmount);
    } else if (pnlPercent < 0) {
        results.totalLosses++;
        results.totalLoss += Math.abs(pnlAmount);
        results.biggestLoss = Math.max(results.biggestLoss, Math.abs(pnlAmount));
    }

    results.trades.push(position);
    results.totalTrades++;
    openPosition = null;
    strategy.resetPosition();
}

function runIteration(candle, data, index) {
    if (checkIfInPosition()) {
        const slTpExit = checkIfHitSLOrTP(candle);
        if (slTpExit) {
            closePosition({ position: openPosition, reason: slTpExit.reason }, candle);
            return;
        }

        const shouldExit = strategy.checkExitCriteria(candle, data, index);
        if (shouldExit) {
            closePosition(shouldExit, candle);
        }
    } else {
        const shouldEnter = strategy.checkEntryCriteria(candle, data, index);
        if (shouldEnter) {
            enterPosition(shouldEnter);
        }
    }
}

function computeMetrics() {
    let equity = INITIAL_CAPITAL;
    let peakEquity = INITIAL_CAPITAL;
    const tradeReturns = [];

    for (const trade of results.trades) {
        equity += trade.pnlAmount;
        peakEquity = Math.max(peakEquity, equity);
        const drawdown = peakEquity > 0 ? (peakEquity - equity) / peakEquity : 0;
        results.maxDrawdown = Math.max(results.maxDrawdown, drawdown);
        tradeReturns.push(trade.pnlPercent);
    }

    results.finalEquity = equity;
    results.returnOnInvestmentPercentage = ((equity - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
    results.winRate = results.totalTrades > 0 ? (results.totalWins / results.totalTrades) * 100 : 0;
    results.averageWin = results.totalWins > 0 ? results.totalProfit / results.totalWins : 0;
    results.averageLoss = results.totalLosses > 0 ? results.totalLoss / results.totalLosses : 0;
    results.profitFactor = results.totalLoss > 0 ? results.totalProfit / results.totalLoss : results.totalProfit > 0 ? Infinity : 0;

    if (tradeReturns.length > 1) {
        const meanReturn = tradeReturns.reduce((sum, r) => sum + r, 0) / tradeReturns.length;
        const variance = tradeReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (tradeReturns.length - 1);
        const stdDev = Math.sqrt(variance);
        results.sharpeRatio = stdDev > 0 ? (meanReturn - RISK_FREE_RATE) / stdDev : 0;

        const downsideReturns = tradeReturns.filter((r) => r < 0);
        if (downsideReturns.length > 0) {
            const downsideVariance = downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length;
            const downsideDev = Math.sqrt(downsideVariance);
            results.sortinoRatio = downsideDev > 0 ? (meanReturn - RISK_FREE_RATE) / downsideDev : 0;
        }

        const years = tradeReturns.length / 252;
        const annualizedReturn = years > 0 ? results.returnOnInvestmentPercentage / 100 / years : 0;
        results.calmarRatio = results.maxDrawdown > 0 ? annualizedReturn / results.maxDrawdown : 0;
    }
}

function formatCurrency(value) {
    const sign = value >= 0 ? '+' : '-';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function formatPercent(value, digits = 2) {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(digits)}%`;
}

function logPerformanceReport(data, meta, signalStats) {
    const firstCandle = data[0];
    const lastCandle = data[data.length - 1];

    console.log('');
    console.log('══════════════════════════════════════════════════════════');
    console.log(' STRATEGY BACKTEST RESULTS');
    console.log('══════════════════════════════════════════════════════════');
    console.log(` Ticker:     ${ticker}`);
    console.log(` Timeframe:  ${meta.timeframe}`);
    console.log(` Candles:    ${data.length} returned (requested ${meta.candles})`);
    console.log(` Period:     ${firstCandle.datetime} → ${lastCandle.datetime}`);
    console.log('──────────────────────────────────────────────────────────');
    console.log(' SIGNAL ANALYSIS');
    console.log('──────────────────────────────────────────────────────────');
    console.log(` Golden crosses:       ${signalStats.goldenCrosses}`);
    console.log(` Death crosses:        ${signalStats.deathCrosses}`);
    console.log(` Qualified entries:    ${signalStats.qualifiedEntries} (cross + RSI + filters)`);
    console.log(` Trades executed:      ${results.totalTrades}`);
    if (signalStats.qualifiedEntries > results.totalTrades) {
        console.log(` Note: Fewer trades than entries — only one position at a time;`);
        console.log(`       new entries are skipped while a position is open.`);
    }
    console.log('──────────────────────────────────────────────────────────');
    console.log(' PERFORMANCE SUMMARY');
    console.log('──────────────────────────────────────────────────────────');
    console.log(` Initial Capital:   $${INITIAL_CAPITAL.toFixed(2)}`);
    console.log(` Final Equity:      $${results.finalEquity.toFixed(2)}`);
    console.log(` Net P&L:           ${formatCurrency(results.finalEquity - INITIAL_CAPITAL)} (${formatPercent(results.returnOnInvestmentPercentage)})`);
    console.log(` Total Trades:      ${results.totalTrades}`);
    console.log(` Wins / Losses:     ${results.totalWins} / ${results.totalLosses}`);
    console.log(` Win Rate:          ${results.winRate.toFixed(1)}%`);
    console.log(` Profit Factor:     ${results.profitFactor === Infinity ? '∞' : results.profitFactor.toFixed(2)}`);
    console.log(` Avg Win:           ${formatCurrency(results.averageWin)}`);
    console.log(` Avg Loss:          -$${results.averageLoss.toFixed(2)}`);
    console.log(` Biggest Win:       ${formatCurrency(results.biggestWin)}`);
    console.log(` Biggest Loss:      -$${results.biggestLoss.toFixed(2)}`);
    console.log(` Max Drawdown:      ${(results.maxDrawdown * 100).toFixed(2)}%`);
    console.log(` Sharpe Ratio:      ${results.sharpeRatio.toFixed(3)}`);
    console.log(` Sortino Ratio:     ${results.sortinoRatio.toFixed(3)}`);
    console.log(` Calmar Ratio:      ${results.calmarRatio.toFixed(3)}`);
    console.log('──────────────────────────────────────────────────────────');
    console.log(' TRADE LOG');
    console.log('──────────────────────────────────────────────────────────');

    if (results.trades.length === 0) {
        console.log(' No trades executed during this period.');
    } else {
        results.trades.forEach((trade, index) => {
            const outcome = trade.win ? 'WIN ' : trade.pnlPercent < 0 ? 'LOSS' : 'FLAT';
            console.log(
                ` #${String(index + 1).padStart(3)} | ${trade.direction.toUpperCase().padEnd(5)} | ` +
                `Entry: $${trade.entryPrice.toFixed(2)} → Exit: $${trade.exitPrice.toFixed(2)} | ` +
                `${formatPercent(trade.pnlPercent * 100)} (${formatCurrency(trade.pnlAmount)}) | ${outcome} | ${trade.exitReason}`
            );
        });
    }

    console.log('══════════════════════════════════════════════════════════');
    console.log('');
}

module.exports = {
    run,
    runBacktest
};
