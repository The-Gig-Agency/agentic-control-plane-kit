/**
 * Register kernel with Governance Hub (Repo B)
 * 
 * Sends heartbeat to register the kernel and get API key if needed.
 */

export interface RegisterOptions {
  governanceHubUrl: string;
  kernelApiKey?: string;
  kernelId: string;
  integration: string;
}

export async function registerKernel(options: RegisterOptions): Promise<void> {
  const { governanceHubUrl, kernelApiKey, kernelId, integration } = options;

  if (!kernelApiKey) {
    console.warn('⚠️  No kernel API key provided. Skipping registration.');
    console.warn('   You can register manually in Governance Hub UI.');
    return;
  }

  const url = `${governanceHubUrl}/functions/v1/heartbeat`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${kernelApiKey}`,
      },
      body: JSON.stringify({
        kernel_id: kernelId,
        version: '1.0.0',
        packs: [integration],
        env: 'production',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `Registration failed: ${response.status}`);
    }

    const result = await response.json();
    if (result.ok) {
      console.log(`✅ Kernel "${kernelId}" registered successfully`);
    } else {
      throw new Error(result.error || 'Registration failed');
    }
  } catch (error) {
    throw new Error(`Failed to register kernel: ${error}`);
  }
}
