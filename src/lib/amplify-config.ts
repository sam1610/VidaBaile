/**
 * Side-effect module — import this FIRST in main.tsx.
 *
 * ES modules hoist all imports and evaluate them in dependency order before
 * any executable code runs. By placing Amplify.configure() here and
 * importing this file first, we guarantee the Cognito User Pool is configured
 * before @aws-amplify/ui-react <Authenticator> or any auth call executes.
 */
import { Amplify } from 'aws-amplify';
import amplifyOutputs from './amplify-outputs';

Amplify.configure(amplifyOutputs);
