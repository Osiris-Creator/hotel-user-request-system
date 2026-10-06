// Configuration
const API_URL = 'https://hotel-user-request-system.vsam.workers.dev';

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');
const action = urlParams.get('action');

// State
let requestData = null;
let approvalData = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  if (!token) {
    showError('Invalid approval link: Missing token');
    return;
  }

  if (!action || !['approve', 'reject'].includes(action)) {
    showError('Invalid approval link: Missing or invalid action');
    return;
  }

  // Load approval details
  await loadApprovalDetails();
});

// Load approval details
async function loadApprovalDetails() {
  try {
    const response = await fetch(`${API_URL}/api/approve/details?token=${token}`);
    const result = await response.json();

    if (!response.ok || !result.success) {
      showError(result.message || 'Failed to load approval details');
      return;
    }

    requestData = result.request;
    approvalData = result.approval;

    // Display the details
    displayApprovalDetails();

    // Setup button handlers
    setupButtons();

  } catch (error) {
    console.error('Load error:', error);
    showError('Failed to load approval details. Please try again.');
  }
}

// Display approval details
function displayApprovalDetails() {
  document.getElementById('loading-state').style.display = 'none';
  document.getElementById('approval-content').style.display = 'block';

  // Set approver badge
  document.getElementById('approver-badge').textContent = `Approver Level ${approvalData.approver_level}`;

  // Set request details
  document.getElementById('request-number').textContent = requestData.request_number;
  document.getElementById('employee-name').textContent = requestData.employee_name;
  document.getElementById('programs').textContent = requestData.programs;
  document.getElementById('department').textContent = requestData.department || 'N/A';
  document.getElementById('request-date').textContent = new Date(requestData.created_at).toLocaleString();

  // Pre-select action based on URL
  if (action === 'reject') {
    document.getElementById('approve-btn').style.opacity = '0.5';
  }
}

// Setup button handlers
function setupButtons() {
  const approveBtn = document.getElementById('approve-btn');
  const rejectBtn = document.getElementById('reject-btn');
  const commentField = document.getElementById('comment');

  approveBtn.addEventListener('click', async () => {
    if (action !== 'approve') {
      if (!confirm('You clicked the Reject link but are pressing Approve. Are you sure you want to approve?')) {
        return;
      }
    }
    await submitApproval('approve', commentField.value);
  });

  rejectBtn.addEventListener('click', async () => {
    if (action !== 'reject') {
      if (!confirm('You clicked the Approve link but are pressing Reject. Are you sure you want to reject?')) {
        return;
      }
    }
    await submitApproval('reject', commentField.value);
  });
}

// Submit approval
async function submitApproval(finalAction, comment) {
  const approveBtn = document.getElementById('approve-btn');
  const rejectBtn = document.getElementById('reject-btn');

  // Disable buttons
  approveBtn.disabled = true;
  rejectBtn.disabled = true;

  try {
    const response = await fetch(`${API_URL}/api/approve?token=${token}&action=${finalAction}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        comment: comment || ''
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      showError(result.message || 'Failed to process approval');
      approveBtn.disabled = false;
      rejectBtn.disabled = false;
      return;
    }

    // Show success
    showSuccess(finalAction, result);

  } catch (error) {
    console.error('Submission error:', error);
    showError('Failed to submit approval. Please try again.');
    approveBtn.disabled = false;
    rejectBtn.disabled = false;
  }
}

// Show error
function showError(message) {
  document.getElementById('loading-state').style.display = 'none';
  document.getElementById('approval-content').style.display = 'none';
  document.getElementById('error-state').style.display = 'block';
  document.getElementById('error-text').textContent = message;
}

// Show success
function showSuccess(finalAction, result) {
  document.getElementById('approval-content').style.display = 'none';
  document.getElementById('success-state').style.display = 'block';

  const actionText = finalAction === 'approve' ? 'approved' : 'rejected';
  const emoji = finalAction === 'approve' ? '✅' : '❌';

  let message = `${emoji} Request ${actionText} successfully!`;

  if (finalAction === 'approve' && result.needsMoreApproval) {
    message += ' The request has been forwarded to the next approver.';
  } else if (finalAction === 'approve') {
    message += ' The request is now fully approved.';
  }

  document.getElementById('success-text').textContent = message;
}
