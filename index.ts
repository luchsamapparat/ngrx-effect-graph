import * as yargs from 'yargs'
import { Argv } from 'yargs';
import * as path from 'path';
import * as fs from 'fs';
import Ast, { SyntaxKind, CallExpression, PropertyAccessExpression, Node, NewExpression } from "ts-simple-ast";
import * as Viz from 'viz.js';

const argv = yargs
    .option('project', {
        alias: 'p',
        default: './tsconfig.json'
    })
    .argv

const tsConfigFilePath = path.resolve(argv.project);

const ast = new Ast({
    tsConfigFilePath
});

const effectsClassFiles = ast.getSourceFiles('**/*.effects.ts');
let actionMappings: string[][] = [];

effectsClassFiles.map(effectsClassFile => {
    // const effectsClassFile = effectsClassFiles[0];
    const effectsClass = effectsClassFile.getClasses()[0];

    const effects = effectsClass.getInstanceProperties();

    effects.forEach(effect => {
        // const effect = effects[2];
        
        effect.getChildrenOfKind(SyntaxKind.CallExpression).map(callExpression => {
            const ofTypeCallExpression = getOfTypeCallExpression(callExpression);

            const sourceActions = getActionNamesFromOfTypeCallExpression(ofTypeCallExpression);
                
            const dispatcherType = getIdentifier(callExpression
                .getFirstChildByKindOrThrow(SyntaxKind.PropertyAccessExpression));
            const dispatcherMethod = callExpression.getArguments()[0];

            let dispatchedActions: string[];

            switch (dispatcherType) {
                case 'switchMap':
                case 'mergeMap':
                case 'map':
                    dispatchedActions = dispatcherMethod
                        .getDescendantsOfKind(SyntaxKind.NewExpression)
                        .map(newExpression => getActionNameFromNewExpression(newExpression))
                        .filter(className => className.endsWith('Action'))
                        .map(className => className.replace(/Action$/, ''));
                    break;
                    
                case 'do':
                    const methodBody = dispatcherMethod
                        .getFirstChildByKindOrThrow(SyntaxKind.CallExpression)
                        .getText()
                        .replace('"', "''");
                    dispatchedActions = [methodBody];
                    break;

                default:
                    throw new Error(`Unexpected dispatcher method: ${dispatcherType}`);
            }

            sourceActions.forEach(sourceAction => {
                dispatchedActions.forEach(dispatchedAction => {
                    actionMappings = [
                        ...actionMappings,
                        [sourceAction, dispatchedAction]
                    ]
                });
            });
        })
    });
});

const actionPairs = actionMappings.map(([sourceAction, dispatchedAction]) => `"${sourceAction}" -> "${dispatchedAction}"`);

const graph = Viz(`digraph {
    ${actionPairs.join('\n')}
}`);

fs.writeFile('graph.svg', graph, error => {
    if (error) {
        throw error;
    };
});

function getOfTypeCallExpression(expression: CallExpression): CallExpression {
    const propertyAccessExpression = expression.getFirstChildByKindOrThrow(SyntaxKind.PropertyAccessExpression);

    if (getIdentifier(propertyAccessExpression) === 'ofType') {
        return expression;
    }
    
    const callExpression = propertyAccessExpression.getFirstChildByKindOrThrow(SyntaxKind.CallExpression);

    return getOfTypeCallExpression(callExpression)
}

function getActionNamesFromOfTypeCallExpression(expression: CallExpression): string[] {
    const args = expression.getArguments();
    
    return args.map(argument => {
        if (argument.getKind() === SyntaxKind.PropertyAccessExpression) {
            return getIdentifier(<PropertyAccessExpression> argument);
        }

        return argument.getText();
    });
}

function getActionNameFromNewExpression(expression: NewExpression): string {
    return expression.getExpression().getText();
}

function getIdentifier(node: Node): string {
    return node.getLastChildByKindOrThrow(SyntaxKind.Identifier).getText();
}
