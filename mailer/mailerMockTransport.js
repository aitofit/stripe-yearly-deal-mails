const mockTransport = { 
    name: 'mockTransport',
    version: '0.1.0',
    send: (mail, callback) => {
        let input = mail.message.createReadStream();
        let envelope = mail.message.getEnvelope();
        let messageId = mail.message.messageId();
        input.pipe(process.stdout);
        input.on('end', function() {
            callback(null, {
                envelope,
                messageId
            });
        });
    }
}

module.exports = { mockTransport }