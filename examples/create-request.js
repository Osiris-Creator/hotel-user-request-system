// ตัวอย่างการสร้างคำขอเข้าใช้งานโปรแกรม
const axios = require('axios');

const API_URL = 'http://localhost:3000/api';

async function createUserRequest() {
  try {
    // ตัวอย่างที่ 1: พนักงาน Front Desk
    const request1 = {
      user: {
        employee_id: 'EMP001',
        first_name: 'สมชาย',
        last_name: 'ใจดี',
        email: 'somchai@hotel.com',
        department: 'Front Office',
        position: 'Receptionist'
      },
      requester: {
        name: 'นางสาวสุดา ผู้จัดการ',
        email: 'suda.manager@hotel.com'
      },
      programAccess: [
        { program_id: 1, role_id: 2 }, // Opera Cloud - Front Desk
        { program_id: 4, role_id: 10 } // Visionline - Front Desk
      ],
      notes: 'พนักงานใหม่เริ่มงานวันที่ 1 ตุลาคม 2026'
    };

    const response1 = await axios.post(`${API_URL}/requests`, request1);
    console.log('✅ สร้างคำขอสำเร็จ:', response1.data);
    console.log('Request Number:', response1.data.data.requestNumber);

    // ตัวอย่างที่ 2: พนักงาน Finance
    const request2 = {
      user: {
        employee_id: 'EMP002',
        first_name: 'สมหญิง',
        last_name: 'การเงิน',
        email: 'somying@hotel.com',
        department: 'Accounting',
        position: 'Accountant'
      },
      requester: {
        name: 'นายบัญชี ผู้จัดการ',
        email: 'banchi.manager@hotel.com'
      },
      programAccess: [
        { program_id: 1, role_id: 6 }, // Opera Cloud - Report Viewer
        { program_id: 6, role_id: 23 } // Oracle Fusion - Finance
      ],
      notes: 'ต้องการสิทธิ์ดูรายงานและจัดการระบบการเงิน'
    };

    const response2 = await axios.post(`${API_URL}/requests`, request2);
    console.log('✅ สร้างคำขอสำเร็จ:', response2.data);
    console.log('Request Number:', response2.data.data.requestNumber);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error.response?.data || error.message);
  }
}

// เรียกใช้งาน
createUserRequest();
