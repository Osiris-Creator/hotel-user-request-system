// ตัวอย่างการดู Audit Logs
const axios = require('axios');

const API_URL = 'http://localhost:3000/api';

async function viewAuditLogs() {
  try {
    // ดู Audit Log ทั้งหมดของเดือนนี้
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const fromDate = firstDay.toISOString().split('T')[0];
    const toDate = lastDay.toISOString().split('T')[0];

    console.log(`📊 Audit Logs จาก ${fromDate} ถึง ${toDate}\n`);

    const response = await axios.get(`${API_URL}/audit`, {
      params: {
        fromDate,
        toDate,
        limit: 50
      }
    });

    const logs = response.data.data;

    if (logs.length === 0) {
      console.log('ไม่พบข้อมูล Audit Log');
      return;
    }

    // จัดกลุ่มตาม Request Number
    const groupedLogs = {};
    logs.forEach(log => {
      const reqNum = log.request_number || 'N/A';
      if (!groupedLogs[reqNum]) {
        groupedLogs[reqNum] = [];
      }
      groupedLogs[reqNum].push(log);
    });

    // แสดงผล
    Object.keys(groupedLogs).forEach(reqNum => {
      console.log(`\n📄 Request: ${reqNum}`);
      console.log('─'.repeat(60));

      groupedLogs[reqNum].forEach(log => {
        const date = new Date(log.created_at).toLocaleString('th-TH');
        console.log(`[${date}]`);
        console.log(`  Action: ${log.action}`);
        console.log(`  Changed By: ${log.changed_by}`);
        console.log(`  Description: ${log.change_description}`);

        if (log.old_value && log.new_value) {
          console.log(`  Change: ${log.old_value} → ${log.new_value}`);
        }
        console.log();
      });
    });

    // สรุปสถิติ
    console.log('\n📈 สถิติ');
    console.log('─'.repeat(60));
    const actionCount = {};
    logs.forEach(log => {
      actionCount[log.action] = (actionCount[log.action] || 0) + 1;
    });

    Object.keys(actionCount).forEach(action => {
      console.log(`${action}: ${actionCount[action]} ครั้ง`);
    });

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error.response?.data || error.message);
  }
}

// ตัวอย่างการค้นหา Audit Log แบบเจาะจง
async function searchAuditLogs(action, days = 7) {
  try {
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    console.log(`🔍 ค้นหา Action: ${action} ในช่วง ${days} วันที่ผ่านมา\n`);

    const response = await axios.get(`${API_URL}/audit`, {
      params: {
        action,
        fromDate: fromDate.toISOString().split('T')[0],
        toDate: toDate.toISOString().split('T')[0],
        limit: 100
      }
    });

    const logs = response.data.data;
    console.log(`พบ ${logs.length} รายการ\n`);

    logs.forEach((log, index) => {
      const date = new Date(log.created_at).toLocaleString('th-TH');
      console.log(`${index + 1}. [${date}]`);
      console.log(`   Request: ${log.request_number || 'N/A'}`);
      console.log(`   ${log.change_description}`);
      console.log(`   By: ${log.changed_by}\n`);
    });

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error.response?.data || error.message);
  }
}

// ใช้งาน
const command = process.argv[2] || 'view';

if (command === 'view') {
  viewAuditLogs();
} else if (command === 'search') {
  const action = process.argv[3] || 'CREATE';
  const days = parseInt(process.argv[4]) || 7;
  searchAuditLogs(action, days);
} else {
  console.log('Usage:');
  console.log('  node view-audit-logs.js view              - ดู audit logs ทั้งหมด');
  console.log('  node view-audit-logs.js search CREATE 7   - ค้นหา action CREATE ใน 7 วัน');
}
