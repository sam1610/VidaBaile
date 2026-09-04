import { View } from '@aws-amplify/ui-react';
import { ComprehensiveClubConsole } from './ComprehensiveClubConsole';

export function HomeTab() {
  return (
    <View as="main" padding="0">
      <ComprehensiveClubConsole />
    </View>
  );
}
