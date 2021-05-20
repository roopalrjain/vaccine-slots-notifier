const https = require('https');
const aws = require("aws-sdk");
const sns = new aws.SNS({
    region: 'ap-south-1'
});
const ssm = new aws.SSM();

const timer = ms => new Promise(res => setTimeout(res, ms));

exports.handler = (event, context, callback) => {

    console.log("Index Function triggered");
    execute();
};

async function execute() {

    var pinCodes = getPinCodesData();

    for (let [pinCode, topic] of pinCodes) {
        var date = new Date();
        if (Number(await getNotificationBackOffTimeForPin(pinCode)) > date.getTime()) {
            console.log("Skipping pin code:" + pinCode + ", due to backoff time.");
            continue;
        }
        var inputDate = date.getDate() + '-' + (date.getMonth() + 1) + '-' + date.getFullYear();
        console.log('Pin: ' + pinCode + ', date: ' + inputDate);
        const options = getRequestOptions(pinCode, inputDate);
        const req = https.request(options, (res) => {
            var msg = "[Vaccine Slots]\nPin: " + pinCode + "\n\n";
            let body = '';
            console.log('Status: ' + res.statusCode + ', content-type:' + res.headers['content-type']);
            res.setEncoding('utf8');
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                if (res.statusCode == 200 && res.headers['content-type'].indexOf('application/json') >= 0) {
                    var shouldSendSms = false;
                    console.log('Successfully received response' + body);
                    body = JSON.parse(body);
                    var centers = body['centers'];
                    centers.forEach(function(center) {
                        var centerMsg = center['name'] + "\n";
                        var centerHasSlots = false;
                        var sessions = center['sessions'];
                        sessions.forEach(function(session) {
                            var minAge = session['min_age_limit'];
                            var slots = session['available_capacity'];
                            var date = getShortDate(session['date']);
                            if (minAge < 27 && slots > 5) {
                                var sessionMsg = date + ", " + minAge + "+" + ", Slot:" + slots + "\n";
                                centerMsg += sessionMsg;
                                centerHasSlots = true;
                                shouldSendSms = true;
                            }
                        });
                        if (centerHasSlots) {
                            msg += centerMsg + "\n";
                        }
                    });
                    msg += "\n- Roopal (+91-8390903121, WhatsApp only)";
                    console.log("Should send message:" + shouldSendSms + ", Pin: " + pinCode + ", SNS topic:" + topic + ", msg: " + msg);
                    if (shouldSendSms) {
                        sns.publish({
                            Message: msg,
                            TopicArn: 'arn:aws:sns:ap-south-1:526929930244:' + topic
                        }, function(err, data) {
                            if (err) {
                                console.log(err);
                            }
                            else {
                                updateNotificationBackOffTimeForPin(pinCode);
                            }
                        });
                    }
                } else {
                    console.error("Couldn't get successful response for " + options['path']);
                }
            });
        });

        req.on('error', (e) => {
            console.log("Call to CoWin API errored out");
            console.error(e);
        });

        req.end();

        console.log("waiting here....");
        await timer(200);
    }
}

async function getNotificationBackOffTimeForPin(pin) {
            var parameter = {
                "Name" : "/vaccine/slots/notificationBackOffTime/" + pin
            };
            var responseFromSSM = await ssm.getParameter(parameter).promise();
            return responseFromSSM['Parameter']['Value'];
}

async function updateNotificationBackOffTimeForPin(pin) {
    var newBackOffTime = new Date().getTime() +  20 * 60 * 1000;
    console.log("Updating backoff time for pin: " + pin + ", new time: " + newBackOffTime);
            var parameter = {
                "Name" : "/vaccine/slots/notificationBackOffTime/" + pin,
                "Overwrite" : true,
                "Value" : newBackOffTime.toString()
            };
            await ssm.putParameter(parameter).promise();
}

function getPinCodesData() {
    var pinCodesData = new Map();
    pinCodesData.set('487118', 'vaccine-slot');
    pinCodesData.set('482002', 'vaccine-slot-482002');
    pinCodesData.set('284403', 'vaccine-slot-284403');
    pinCodesData.set('411028', 'vaccine-slot-411028');
    pinCodesData.set('452007', 'vaccine-slot-452007');
    pinCodesData.set('473551', 'vaccine-slot-473551');
    pinCodesData.set('482008', 'vaccine-slot-482008');
    pinCodesData.set('201301', 'vaccine-slot-201301');
    return pinCodesData;
}

function getRequestOptions(pinCode, date) {
    return {
        hostname: 'cdn-api.co-vin.in',
        port: 443,
        path: '/api/v2/appointment/sessions/public/calendarByPin?pincode=' + pinCode + '&date=' + date,
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        }
    };
}

function getShortDate(date) {
    var [day, month, year] = date.split('-');
    var shortDate = day + '-';
    if (month == '01' || month == "1") {
        return shortDate += 'Jan';
    }
    if (month == '02' || month == "2") {
        return shortDate += 'Feb';
    }
    if (month == '03' || month == "3") {
        return shortDate += 'Mar';
    }
    if (month == '04' || month == "4") {
        return shortDate += 'Apr';
    }
    if (month == '05' || month == "5") {
        return shortDate += 'May';
    }
    if (month == '06' || month == "6") {
        return shortDate += 'June';
    }
    if (month == '07' || month == "7") {
        return shortDate += 'July';
    }
    if (month == '08' || month == "8") {
        return shortDate += 'Aug';
    }
    if (month == '09' || month == "9") {
        return shortDate += 'Sept';
    }
    if (month == '10') {
        return shortDate += 'Oct';
    }
    if (month == '11') {
        return shortDate += 'Nov';
    }
    if (month == '12') {
        return shortDate += 'Dec';
    }
    return shortDate += month;
}
