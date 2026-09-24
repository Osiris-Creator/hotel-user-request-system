// ตัวอย่างการอนุมัติคำขอ
const axios = require('axios');

const API_URL = 'http://localhost:3000/api';

async function approveRequest(requestId) {
  try {
    // อนุมัติคำขอ
    const approveData = {
      status: 'approved',
      changedBy: 'IT Manager',
      approvedBy: 'คุณสมศักดิ์ ผู้อนุมัติ'
    };

    const response = await axios.patch(
      `${API_URL}/requests/${requestId}/status`,
      approveData
    );

    console.log('✅ อนุมัติคำขอสำเร็จ:', response.data);

    // ดูข้อมูลคำขอหลังอนุมัติ
    const requestInfo = await axios.get(`${API_URL}/requests/${requestId}`);
    console.log('\nข้อมูลคำขอ:');
    console.log('- Request Number:', requestInfo.data.data.request_number);
    console.log('- Status:', requestInfo.data.data.status);
    console.log('- Approved By:', requestInfo.data.data.approved_by);
    console.log('- Approved Date:', requestInfo.data.data.approved_date);

    // ดู Audit Log
    const auditLog = await axios.get(`${API_URL}/requests/${requestId}/audit`);
    console.log('\n📋 Audit Log:');
    auditLog.data.data.forEach(log => {
      console.log(`- ${log.action}: ${log.change_description} (${log.changed_by})`);
    });

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error.response?.data || error.message);
  }
}

// ใช้งาน: node approve-request.js [requestId]
const requestId = process.argv[2] || 1;
approveRequest(requestId);
