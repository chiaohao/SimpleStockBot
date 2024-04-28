import { Strategy } from "@fugle/backtest"

type TradeParams = {
    strategy: Strategy, 
    index: number, 
    buySignal: boolean, 
    sellSignal: boolean,
    skipPeriod: number,
    fixedTradeSize?: number
}

const allInLongTrade = (param : TradeParams) => {
    if (param.index < param.skipPeriod) return;

    const ownedSize = param.strategy.trades.reduce((prev, cur) => prev + cur.size, 0);
    if (param.buySignal) {
        const buySize = Math.floor(param.strategy.equity / param.strategy.data['close'].values[param.index]);
        param.strategy.buy({ size: buySize });
    }
    if (param.sellSignal && ownedSize > 0) {
        param.strategy.sell({ size: ownedSize });
    }
}

const allInLongShortTrade = (param : TradeParams) => {
    if (param.index < param.skipPeriod) return;

    const ownedSize = param.strategy.trades.reduce((prev, cur) => prev + cur.size, 0);
    const tradeSize = Math.floor(param.strategy.equity / param.strategy.data['close'].values[param.index]);
    if (param.buySignal && ownedSize <= 0) {
        param.strategy.buy({ size: ownedSize == 0 ? tradeSize : -ownedSize });
    }
    if (param.sellSignal && ownedSize >= 0) {
        param.strategy.sell({ size: ownedSize == 0 ? tradeSize : ownedSize });
    }

}

const fixedLongTrade = (param : TradeParams) => {
    if (param.index < param.skipPeriod) return;

    const ownedSize = param.strategy.trades.reduce((prev, cur) => prev + cur.size, 0);
    if (param.buySignal) {
        param.strategy.buy({ size: param.fixedTradeSize ?? -1 });
    }
    if (param.sellSignal && ownedSize > 0) {
        param.strategy.sell({ size: param.fixedTradeSize ?? -1 });
    }

}

const buyFixedSellAllLong = (param : TradeParams) => {
    if (param.index < param.skipPeriod) return;

    const ownedSize = param.strategy.trades.reduce((prev, cur) => prev + cur.size, 0);
    if (param.buySignal) {
        param.strategy.buy({ size: param.fixedTradeSize ?? -1 });
    }
    if (param.sellSignal && ownedSize > 0) {
        param.strategy.trades.reverse().forEach(trade => param.strategy.sell({ size: trade.size }));
    }

}

export enum TradeMethod {
    AllInLong,
    AllInLongShort,
    FixedLong,
    BuyFixedSellAllLong,
}

export const trade = (method: TradeMethod, param: TradeParams) =>
{
    switch(method) {
        case TradeMethod.AllInLong:
            allInLongTrade(param);
            break;
        case TradeMethod.AllInLongShort:
            allInLongShortTrade(param);
            break;
        case TradeMethod.FixedLong:
            fixedLongTrade(param);
            break;
        case TradeMethod.BuyFixedSellAllLong:
            buyFixedSellAllLong(param);
            break;
    }
}