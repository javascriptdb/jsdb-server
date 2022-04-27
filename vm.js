const cachedRuns = new Map();
import {VM} from "vm2";

export function memoizedRun(sandbox, expression) {
    const key = JSON.stringify(sandbox)+expression;
    if(cachedRuns.has(key)) {
        console.log('From cache');
        return cachedRuns.get(key)
    }
    console.log('Dry run')
    const vm = new VM({
        timeout: 1000,
        allowAsync: false,
        sandbox,
    });
    const result = vm.run(expression);
    cachedRuns.set(key, result);
    return result;
}