export enum TradingIntention {
    Buy,
    Sell,
    DoNothing,
}

export type ohlcv = {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
}