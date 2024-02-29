import { Strategy } from "@fugle/backtest";
import { SMA, CrossUp, CrossDown } from "technicalindicators";
import { TradeMethod, trade } from "./utils";

export class SmaCrossStrategy extends Strategy {
    private readonly params = {
        n1: 15,
        n2: 60,
        tradeMethod: TradeMethod.AllInLong,
    }

    override init() {
        const lineA = SMA.calculate({
            period: this.params.n1,
            values: this.data['close'].values,
        });
        this.addIndicator('lineA', lineA);

        const lineB = SMA.calculate({
            period: this.params.n2,
            values: this.data['close'].values,
        });
        this.addIndicator('lineB', lineB);

        const crossUp = CrossUp.calculate({
            lineA: this.getIndicator('lineA') as number[],
            lineB: this.getIndicator('lineB') as number[],
        });
        this.addSignal('crossUp', crossUp);

        const crossDown = CrossDown.calculate({
            lineA: this.getIndicator('lineA') as number[],
            lineB: this.getIndicator('lineB') as number[],
        });
        this.addSignal('crossDown', crossDown);
    }
    
    override next = (ctx: { index: any; signals: any; }) => 
        trade(
            this.params.tradeMethod,
            {
                strategy: this, 
                index: ctx.index,
                buySignal: ctx.signals.get('crossUp'),
                sellSignal: ctx.signals.get('crossDown'),
                skipPeriod: Math.max(this.params.n1, this.params.n2)
            });
}