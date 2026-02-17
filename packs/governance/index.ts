/**
 * Governance Pack - Main Export
 */

import { Pack } from '../../kernel/src/pack';
import { governanceActions } from './actions';
import { handleProposePolicy } from './handlers';

export const governancePack: Pack = {
  name: 'governance',
  actions: governanceActions,
  handlers: {
    'governance.propose_policy': handleProposePolicy,
  },
};
