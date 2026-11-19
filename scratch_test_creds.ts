import { sendUserCredentialsEmail } from './src/services/email.service.js';

(async () => {
  try {
    console.log('Testing sendUserCredentialsEmail for Rakhi.Bajpai@techwagger.com...');
    const result = await sendUserCredentialsEmail({
      to: 'rakhi.bajpai@techwagger.com',
      firstName: 'Rakhi',
      role: 'student',
      loginEmail: 'rakhi.bajpai@techwagger.com',
      enrollmentNo: 'ENR-12345',
      resetToken: 'test-reset-token-12345',
      orgName: 'Mindsprint'
    });
    console.log('sendUserCredentialsEmail RESULT:', result);
  } catch (err) {
    console.error('sendUserCredentialsEmail ERROR:', err);
  }
})();
