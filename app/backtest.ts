import { Backtest } from '@fugle/backtest';
import { HistoryFetcher } from './history';
import fs from 'fs';
import { SmaCrossStrategy } from './strategy/smacross';
const { MarketApiKey, TargetSymbols } = require('./config.json');

const isMarketCompany : (arg0 : string) => boolean = (symbol : string) => {
    return symbol.length === 4 && symbol[0] >= '1' && symbol[0] <= '9';
}

const main : () => Promise<void> = async () => {
    const symbols = TargetSymbols;

    const output = [] as Array<Array<string>>;

    const historyFetcher = new HistoryFetcher(MarketApiKey);

    for (let symbol of symbols) {
        if (!isMarketCompany(symbol))
            continue;

        const data = await historyFetcher.fetch(symbol);
        if (data.length == 0)
            continue;
        
        const backtest = new Backtest(
            data, 
            SmaCrossStrategy, 
            {
                cash: 1000000,
                tradeOnClose: true,
            });

        await backtest.run()        // run the backtest
            .then(results => {
                console.log(`${symbol}`);
                results.print();  // print the results
                results.plot();   // plot the equity curve
                fs.renameSync('output.html', `output${symbol}.html`);

                const data = results.results?.getColumnData ?? [] as string[];
            
                if (output.length == 0) {
                    const indexes = results.results?.index ?? [] as string[];
                    output.push(indexes.map(i => typeof(i) === 'string' ? i : (i as number).toString()));
                    output[0][0] = `Symbol [${data[0].toString()}]`;
                }
                output.push(data.map(i => i.toString()));
                output[output.length - 1][0] = symbol;
            });
    };

    const csv = output.map(row => row.map(c => c.includes(',') ? `"${c}"` : c).join(',')).join('\n');
    fs.writeFileSync(
        'output.csv', 
        csv);
}

main();

