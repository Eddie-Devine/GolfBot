const fetch = require('node-fetch');
const color = require('chalk');
const fs = require('fs');
const puppeteer = require('puppeteer');
const time = require('moment');
const { clearScreenDown } = require('readline');
const { RSA_PKCS1_OAEP_PADDING, SSL_OP_MSIE_SSLV2_RSA_PADDING } = require('constants');

let options;

fs.readFile('options.json', function(err, data){
    if(err){
        log(color.red('Failed to read options!'));
        process.exit();
    }
    else{
        options = JSON.parse(data);
        log('Loaded options');

        let year = options['date'].substring(0, 4);
        let month = options['date'].substring(5, 6);
        let day = options['date'].substring(6, 8);
        let dateStr = `${month}/${day}/${year}`;
        let d = new Date(dateStr);
        let dayName =  d.toLocaleDateString('en-US', { weekday: 'long' });

        if(dayName == 'Saturday' || dayName == 'Sunday'){
            let now = new Date();
            let runTime = new Date(year, parseInt(month)-1, parseInt(day)-7, options['sessionTimeWeekend'][0], options['sessionTimeWeekend'][1], 0, 0);

            let delay = runTime - now;
            if(delay < 0) delay = 0;
            log(`Waiting ${delay} ms to open session...\n`);

            setTimeout(function(){
                openSession();
            }, delay);
        }
        else{
            let now = new Date();
            let runTime = new Date(year, parseInt(month)-1, parseInt(day)-7, options['sessionTime'][0], options['sessionTime'][1], 0, 0);

            let delay = runTime - now;
            if(delay < 0) delay = 0;
            log(`Waiting ${delay} ms to open session...\n`);

            setTimeout(function(){
                openSession();
            }, delay);
        }
    }
});

function log(str){
    console.log(str);
    fs.appendFile('logs.txt', `[${time().format('MMMM Do YYYY, h:mm:ss a')}] ${str}\n`, function(err){
        if(err){
            console.log(color.red('Failed to save logs'));
            process.exit();
        }
    })
}

async function openSession(){
    log('Logging in');
    const browser = await puppeteer.launch({
        headless: !options['showBrowser'],
        slowMo: 0
    });
    page = await browser.newPage();
    await page.setViewport({
        width: 1700,
        height: 1000,
        deviceScaleFactor: 1,
    });
    await page.goto('https://www.thesantaluzclub.com/', {waitUntil: 'networkidle0'});
    const [a] = await page.$x(`//a[contains(., 'Login')]`);
    if(a) await a.click();
    await page.$eval('input[id=login-username]', (el, value) => el.value = value, options['username']);
    await page.$eval('input[id=login-password]', (el, value) => el.value = value, options['password']);
    const loginBtn = await page.$('#login-submit');
    await loginBtn.click();
    await page.waitForNavigation({waitUntil: 'networkidle0'});
    await page.goto('https://www.thesantaluzclub.com/club/scripts/interfaces/MFCHOE3_Redirect.asp?type=teetime');
    await page.waitForNavigation();

    log('Getting cookies');
    let cookies = await page._client.send('Network.getAllCookies');
    cookies = await cookies['cookies'];
    for(let i = 0; i < cookies.length; i++){
        let cookie = cookies[i]['name'] + '=' + cookies[i]['value'] + '; ';
        options['cookie'] = options['cookie'] + cookie;
    }
    log('Grabbed cookies');
}

function wait(){
    let year = options['date'].substring(0, 4);
    let month = options['date'].substring(4, 6);
    let day = options['date'].substring(6, 8);
    let dateStr = `${month}/${day}/${year}`;
    let d = new Date(dateStr);
    let dayName =  d.toLocaleDateString('en-US', { weekday: 'long' });

    if(dayName == 'Saturday' || dayName == 'Sunday'){
        let now = new Date();
        let runTime = new Date(year, parseInt(month)-1, parseInt(day)-7, options['bookingTimeWeekend'][0], options['bookingTimeWeekend'][1], 0, 0);

        let delay = runTime - now;
        if(delay < 0) delay = 0;
        log(`Waiting ${delay} ms to find time...\n`);

        setTimeout(function(){
            log('Finding time');
            grabTime();
        }, delay);
    }
    else{
        let now = new Date();
        let runTime = new Date(year, parseInt(month)-1, parseInt(day)-7, options['bookingTime'][0], options['bookingTime'][1], 0, 0);

        let delay = runTime - now;
        if(delay < 0) delay = 0;
        log(`Waiting ${delay} ms to find time...\n`);

        setTimeout(function(){
            log('Finding time');
            grabTime();
        }, delay);
    }
}

async function grabTime(){
    log('Getting tee sheet');
    let teeSheet = await fetch(`https://santaluz.clubhouseonline-e3.com/api/v1/teetimes/GetAvailableTeeTimes/${options['date']}/1209/0/null/false`, {
        method: 'GET',
        headers: {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'keep-alive',
            'Cookie': options['cookie'],
            'Host': 'santaluz.clubhouseonline-e3.com',
            'Referer': 'https://santaluz.clubhouseonline-e3.com/CMSModules/CHO/TeeTimes/TeeTimes.aspx',
            'sec-ch-ua': '"Google Chrome";v="89", "Chromium";v="89", ";Not A Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36',
        }
    });
    if(teeSheet.status != 200){
        log(color.red(`Failed to get tee sheet (${teeSheet.status})`));
        process.exit();
    }
    else{
        log('Grabbed tee sheet');
        teeSheet = await teeSheet.json();
        teeSheet = await teeSheet['data']['teeSheet'];
        let spot;

        for(let i = 0; i < options['teeTimes'].length; i++){
            let wantedTime = options['teeTimes'][i];

            for(let ii = 0; ii < teeSheet.length; ii++){
                let time = teeSheet[ii]['teeTime'];

                if(time == wantedTime){
                    if(teeSheet[ii]['isBookable']){
                        let players = teeSheet[ii]['players'];
                        let openSpots = 0;
                        for(let iii = 0; iii < players.length; iii++){
                            if(players[iii]['playerTypeTxt'] == 'Available') openSpots++;
                        }

                        if(openSpots == 4){
                            log(color.green(`Found tee time (${time})`));
                            spot = teeSheet[ii];
                            break;
                        }
                        else log(color.red(`Tee time taken (${time})`));

                    }
                    else{
                        log(color.red(`Tee time taken (${time})`));
                    }
                }

            }

            if(spot != undefined){
                book(spot);
                break;
            }

        }

        if(spot == undefined){
            log(color.red('Could not find tee time'));
            process.exit();
        }
    }
}

async function book(spot){
    log('Preparing to book');
    log('Grabbing ID');
    let info = await fetch(`https://santaluz.clubhouseonline-e3.com/api/v1/teetimes/ProceedBooking/${spot['teeSheetTimeId']}`, {
        "headers": {
            "accept": "application/json, text/plain, */*",
            "accept-language": "en-US,en;q=0.9",
            "sec-ch-ua": "\"Google Chrome\";v=\"89\", \"Chromium\";v=\"89\", \";Not A Brand\";v=\"99\"",
            "sec-ch-ua-mobile": "?0",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "cookie": options['cookie'],
        },
        "referrer": "https://santaluz.clubhouseonline-e3.com/CMSModules/CHO/TeeTimes/TeeTimes.aspx",
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": null,
        "method": "GET",
        "mode": "cors"
    });
    info = await info.json();
    info = info['data'];

    let name = info['primaryPlayer'];
    let ID = info['primaryPlayerId'];

    log(`Grabbed ID for ${name} (${ID})`);

    let bookingBody = {
        "Mode": "Booking",
        "BookingId": 0,
        "OwnerId": ID,
        "editingBookingId": null,
        "Reservations": [
            {
                "ReservationId": 0,
                "ReservationType": 0,
                "FullName": name,
                "Transport": "2",
                "Caddy": "false",
                "Rentals": "",
                "MemberId": ID
            },
            {
                "ReservationId": 0,
                "ReservationType": 1,
                "FullName": "TBD TBD",
                "Transport": "2",
                "Caddy": "false",
                "Rentals": "",
                "FirstName": "TBD",
                "LastName": "TBD",
                "GuestId": 0
            },
            {
                "ReservationId": 0,
                "ReservationType": 1,
                "FullName": "TBD TBD",
                "Transport": "2",
                "Caddy": "false",
                "Rentals": "",
                "FirstName": "TBD",
                "LastName": "TBD",
                "GuestId": 0
            },
            {
                "ReservationId": 0,
                "ReservationType": 1,
                "FullName": "TBD TBD",
                "Transport": "2",
                "Caddy": "false",
                "Rentals": "",
                "FirstName": "TBD",
                "LastName": "TBD",
                "GuestId": 0
            }
        ],
        "Holes": 18,
        "StartingHole": "1",
        "wait": false,
        "Allowed": null,
        "enabled": true,
        "startTime": null,
        "endTime": null,
        "Notes": ""
    }

    let resp = await fetch('https://santaluz.clubhouseonline-e3.com/api/v1/teetimes/CommitBooking/0', {
        "headers": {
            "accept": "application/json, text/plain, */*",
            "accept-language": "en-US,en;q=0.9",
            "content-type": "application/json;charset=UTF-8",
            "sec-ch-ua": "\"Google Chrome\";v=\"89\", \"Chromium\";v=\"89\", \";Not A Brand\";v=\"99\"",
            "sec-ch-ua-mobile": "?0",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "cookie": options['cookie'],
        },
        "referrer": "https://santaluz.clubhouseonline-e3.com/CMSModules/CHO/TeeTimes/TeeTimes.aspx",
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": JSON.stringify(bookingBody),
        "method": "POST",
        "mode": "cors"
    });
    resp = await resp.json();
    if(resp['result']){
        log(color.green.bold('\nBOOKED TEE TIME'));
        log(color.inverse('Info:'));
        log(color.inverse('   Date: ' + resp['data']['date']));
        log(color.inverse('   Time: ' + resp['data']['time'] + '  '));
        log(color.inverse('   Holes: ' + resp['data']['numberOfHoles'] + '       '));
        log(color.inverse('   Staring Hole: ' + resp['data']['startingHole'] + ' '));
        log(color.inverse('   ID: ' + resp['data']['bookingId'] + '    '));
    }
    else{
        log(color.red.bold('\nFAILED'));
        log('\n');
        log(resp);
    }

    if(options['repeat']){
        let year = options['date'].substring(0, 4);
        let month = options['date'].substring(4, 6);
        let day = options['date'].substring(6, 8);
        let dateStr = `${month}/${day}/${year}`;
        let d = new Date(dateStr);

        let newDate = new Date(year, month, day);
        newDate.setDate(d.getDate() + 7);

        let newYear = newDate.getFullYear();
        let newMonth = newDate.getMonth();
        let newDay = newDate.getDate();

        if(newMonth < 10) newMonth = `0${newMonth}`;
        if(newDay < 10) newDay = `0${newDay}`;

        let newDateStr = `${newYear}${newMonth}${newDay}`;
        options['date'] = newDateStr;

        wait();
    }
    else{
        log('\nnot repeating - exiting');
        process.exit();
    }
}