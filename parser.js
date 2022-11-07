import * as acorn from "acorn";
import {walk} from "estree-walker";
import _ from "lodash-es";
import * as assert from "assert";
import {safe} from "./opHandlersBetterSqlite.js";

const operatorMaps = {
  '===': '==',
  '&&': 'AND',
  '||': 'OR',
  '!=':'!=',
  '<': '<',
  '<=': '<=',
  '>=':'>='
}

function getOperator(_operator) {
  const operator = operatorMaps[_operator];
  if(!operator) {
    throw new Error(`Operator (${_operator}) not supported.`)
  }
  return operator;
}

export function functionToWhere(functionString, thisArg) {
  const ast = acorn.parse(functionString, {});
  const arrowFunction = ast.body[0].expression;
  assert.equal(arrowFunction.type, 'ArrowFunctionExpression', 'Filter or find callbacks should be arrow functions.')
  assert.equal(arrowFunction.params.length, 1, 'Filter or find callbacks only receive one argument.')
  assert.match(arrowFunction.body.type, /BinaryExpression|LogicalExpression|CallExpression/, 'Callback body should be a one-liner Binary or Logical expression. Blocks are not allowed.')
  const param = arrowFunction.params[0].name;


  let string = '';
  let whereQueryParams = {};
  let whereQueryParamsCount = 0;

  function addAsQueryParam(value) {
    const key = `wq${whereQueryParamsCount}`;
    whereQueryParams[key] = value;
    return '$'+key;
  }

  walk(arrowFunction.body, {
    enter(node, parent, prop, index) {
      if (node.type === 'LogicalExpression') {
        string += '('
      }
      if (node.type === 'BinaryExpression') {
        string += '('
      }
      if (node.type === 'CallExpression' && node.callee.object.type === 'ThisExpression' && ['like','notLike'].includes(node.callee.property.name)) {
        const columnPath = functionString.substring(node.arguments[0].object.end, node.arguments[0].end);
        const operator = node.callee.property.name === 'like' ? 'LIKE' : 'NOT LIKE';
        let likeValue;
        if(node.arguments[1].type === 'Literal') {
          likeValue = node.arguments[1].value;
        } else if(node.arguments[1].type === 'MemberExpression') {
          const likeValuePath = nodeString(functionString, node.arguments[1]);
          likeValue = _.get(thisArg, likeValuePath)
        }
        string += `json_extract(value,'$${safe(columnPath)}') ${operator} ${addAsQueryParam(likeValue)}`
        this.skip()
      }
      if (node.type === 'MemberExpression') {
        if (node.object.name === param) {
          const path = functionString.substring(node.object.end, node.end)
          string += `json_extract(value,'$${safe(path)}')`
        } else {
          const path = nodeString(functionString, node);
          string += addAsQueryParam(_.get(thisArg, path))
        }
        if (prop === 'left') {
          string += getOperator(parent.operator)
        }
        this.skip()
      }
      if (node.type === 'Literal') {
        string += addAsQueryParam(node.value)
        if (prop === 'left') {
          string += getOperator(parent.operator)
        }
        this.skip()
      }
      if (node.type === 'NewExpression' && node.callee.name === 'Date') {
        string += JSON.stringify(node.arguments[0] ? new Date(arguments[0].value) : new Date())
        if (prop === 'left') {
          string += getOperator(parent.operator)
        }
        this.skip()
      }
    },
    leave(node, parent, prop, index) {
      if (node.type === 'LogicalExpression') {
        string += ')'
        if (prop === 'left') {
          string += getOperator(parent.operator)
        }
      }
      if (node.type === 'BinaryExpression') {
        string += ')'
        if (prop === 'left') {
          string += getOperator(parent.operator)
        }
      }

    }
  });
  return {query: string.replaceAll(`"`, `'`), whereQueryParams}
}

function nodeString(fn, node) {
  return fn.substring(node.start, node.end)
}