import { Strategy } from "@fugle/backtest";
import { TradingIntention, ohlcv } from "./types";
import { DataFrame } from "danfojs-node";
import { Broker } from "@fugle/backtest/lib/broker";
import { SmaCrossStrategy } from "../strategy/smacross";

export interface IStrategyWrapper {
    calculateIntention() : { tradingIntention : TradingIntention, price : number };
}

export class SmaCrossStrategyWrapper implements IStrategyWrapper {
    private readonly _strategy : Strategy;

    constructor(ohlcv : ohlcv[]) {
        const dataFrame = new DataFrame(ohlcv);
        this._strategy = new SmaCrossStrategy(
            dataFrame,
            new Broker(dataFrame,{
                cash: 10000,
                commission: 0,
                margin: 1,
                tradeOnClose: true,
                hedging: false,
                exclusiveOrders: false,
              }));
        this._strategy.init();
    }

    calculateIntention(): { tradingIntention: TradingIntention; price: number; } {
        const crossUp = this._strategy.getSignal('crossUp');
        const crossDown = this._strategy.getSignal('crossDown');
        const close = this._strategy.data['close'].values;
        if (crossUp[crossUp.length - 1])
            return { tradingIntention: TradingIntention.Buy, price: close[close.length - 1] };
        else if (crossDown[crossDown.length - 1])
            return { tradingIntention: TradingIntention.Sell, price: close[close.length - 1] };
        else
            return { tradingIntention: TradingIntention.DoNothing, price: NaN };
    }
}
