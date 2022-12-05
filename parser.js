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

export const functionToWhere = _.memoize(function functionToWhere(functionString, thisArg) {
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
          likeValue = _.get({this:thisArg}, likeValuePath)
        }
        string += `json_extract(value,'$${safe(columnPath)}') ${operator} ${addAsQueryParam(likeValue)}`
        this.skip()
      }
      if (node.type === 'MemberExpression') {
        const memberExpressionString = nodeString(functionString,node);
        if (memberExpressionString.startsWith(param+'.')) {
          const path = memberExpressionString.replace(param,'');
          string += `json_extract(value,'$${safe(path)}')`
        } else {
          const path = nodeString(functionString, node);
          string += addAsQueryParam(_.get({this:thisArg}, path))
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
})

export const functionToSelect = _.memoize(function functionToSelect(functionString, thisArg) {
  const ast = acorn.parse(functionString, {});
  const arrowFunction = ast.body[0].expression;
  assert.equal(arrowFunction.type, 'ArrowFunctionExpression', 'Map callbacks should be arrow functions.')
  assert.equal(arrowFunction.params.length, 1, 'Map callbacks only receive one argument.')
  const param = arrowFunction.params[0].name;
  let select = ``;
  if(arrowFunction.body.type === 'ObjectExpression') {
    arrowFunction.body.properties.forEach(property => {
      assert.equal(property.key.type, 'Identifier', 'Each key on the map object should be a string e.j "name"')
      assert.equal(property.value.type, 'MemberExpression', 'Each value on the map object should be a member expression e.j "user.name"')
      select += `${memberExpressionToPath(functionString,param,property.value, thisArg)} as ${safe(property.key.name)}`;
    })
    return {select, singleValue: false};
  } else if(arrowFunction.body.type === 'MemberExpression'){
    select += `${memberExpressionToPath(functionString,param,arrowFunction.body, thisArg)} as value`;
    return {select, singleValue: true};
  }
})

function memberExpressionToPath(functionString,param,memberExpression,thisArg) {
  const memberExpressionString = nodeString(functionString,memberExpression);
  let path = memberExpressionString;
  if(!memberExpressionString.startsWith(param+'.')) { // Expression referencing the arrow fn param
    path = _.get({this:thisArg}, memberExpressionString);
  }
  return `json_extract(value,'$${safe(path?.replace(param,''))}')`;
}

function nodeString(functionString, node) {
  return functionString.substring(node.start, node.end)
}