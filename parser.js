import * as acorn from "acorn";
import {walk} from "estree-walker";
import _ from "lodash-es";
import * as assert from "assert";

export function functionToWhere(fn, thisArg) {
    const ast = acorn.parse(fn);
    const arrowFunction = ast.body[0].expression;
    assert.equal(arrowFunction.type,'ArrowFunctionExpression','Filter or find callbacks should be arrow functions.')
    assert.equal(arrowFunction.params.length,1, 'Filter or find callbacks only receive one argument.')
    assert.match(arrowFunction.body.type,/BinaryExpression|LogicalExpression/, 'Callback body should be a one-liner Binary or Logical expression. Blocks are not allowed.')
    const param =  arrowFunction.params[0].name;
    let string = ''
    let operatorMaps = {
        '===': '==',
        '&&' : 'AND',
        '||' : 'OR'
    }
    function getOperator(operator) {
        return operatorMaps[operator] || operator;
    }
    walk(arrowFunction.body, {
        enter(node, parent, prop, index) {
            if(node.type === 'LogicalExpression') {
                string += '('
            }
            if(node.type === 'BinaryExpression') {
                string += '('
            }
            if(node.type === 'CallExpression' && node.callee.object.regex) {

            }
            if(node.type === 'MemberExpression') {
                if(node.object.name === param) {
                    const path = fn.substring(node.object.end, node.end)
                    string += `json_extract(value,'$${path}')`
                } else {
                    const path = fn.substring(node.start, node.end);
                    string += JSON.stringify(_.get(thisArg, path))
                }
                if(prop === 'left') {
                    string += getOperator(parent.operator)
                }
                this.skip()
            }
            if(node.type === 'Literal') {
                string += fn.substring(node.start, node.end)
                if(prop === 'left') {
                    string += getOperator(parent.operator)
                }
                this.skip()
            }
            if(node.type === 'NewExpression' && node.callee.name === 'Date') {
                string += JSON.stringify(new Date())
                if(prop === 'left') {
                    string += getOperator(parent.operator)
                }
                this.skip()
            }
        },
        leave(node, parent, prop, index) {
            if(node.type === 'LogicalExpression') {
                string += ')'
                if(prop === 'left') {
                    string += getOperator(parent.operator)
                }
            }
            if(node.type === 'BinaryExpression') {
                string += ')'
                if(prop === 'left') {
                    string += getOperator(parent.operator)
                }
            }

        }
    });
    return string.replaceAll(`"`,`'`)
}