export {
  createEnvironmentWorkflowPlan,
  createLinkWorkflowPlan,
  createLoginWorkflowPlan,
  createInitWorkflowPlan,
  createProtectWorkflowPlan,
  createProductShellWorkflowScaffold,
  detectProductShellContext,
  runEnvironmentWorkflow,
  runLinkWorkflow,
  runLoginWorkflow,
} from './product-shell.js';

export type {
  ProductShellContext,
  ProductShellWorkflowExecution,
  ProductShellStep,
  ProductShellWorkflowName,
  ProductShellWorkflowPlan,
  ProductShellWorkflowStatus,
} from './product-shell.js';
