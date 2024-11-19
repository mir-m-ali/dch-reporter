module.exports = generateReport;

const zipLocal = require('zip-local');
const fs = require('fs');

let env = process.env;
let reportTitle = env.REPORT_TITLE ? env.REPORT_TITLE.trim() : '';
let tags = env.TAGS;
let reportTagPattern = env.REPORT_TAG_PATTERN;
if (tags) tags = tags.replace(/[|]/g, ',');
if (!reportTitle) reportTitle = `${env.job_name} Report for ${tags}`;
if (!reportTagPattern) reportTagPattern = '@DCHT-';
let testCases = JSON.parse(
        fs.readFileSync(`allure-report/data/behaviors.json`, {encoding: 'utf8'})
    ).children;
let stats = {
    total: testCases.length,
    passed: 0,
    failed: 0,
    tagCount: 0        
};
testCases.forEach(tc => {
    if (tc.status == 'passed') stats.passed++;
    else if (tc.status == 'failed') stats.failed++;
    //else stats.failed++;   
    tc.tags.forEach(t => {
        if (t.startsWith(reportTagPattern)) stats.tagCount++; 
    });     
});
if (stats.tagCount < stats.total) stats.tagCount = stats.total;
let exectuionTS = (new Date(parseInt(testCases[0]?.time.start))).toString().toLowerCase();
let testDuration = '-';

function getFormattedDurationTime(seconds) {    
    let h = 0, m = 0, s = 0;
    s = seconds % 60;
    let minutes = m = (seconds - s)/60;
    if (minutes > 60) {
        m = minutes % 60;
        h = (minutes - m)/60;
    }
    return `${h}h ${m}m ${s}s`;
}

let bStackBoxTitle = `${env.JOB_NAME} [build#${env.BUILD_NUMBER}]`.toLowerCase();
let bStackDataFile = `bstack-data.json`;
if (!fs.existsSync(`${bStackDataFile}`))
    fs.writeFileSync(`${bStackDataFile}`, `{"build": "", "sessions": []}`);
let bStackData = JSON.parse(fs.readFileSync(`${bStackDataFile}`));
let sessions = JSON.stringify(bStackData.sessions);
let bStackBuildId = bStackData.build;
let html = '';

function buildHtml() { 
    html =
    `
    <!DOCTYPE html>
    <html dir="ltr">
    <head>
        <meta charset="utf-8">
        <title>Allure Report</title>
        <link rel="favicon" href="favicon.ico?v=2">
        <link rel="stylesheet" type="text/css" href="styles.css">
        <link rel="stylesheet" href="plugins/screen-diff/styles.css">	
        <style>	
        #load-screen { position:fixed; padding:0; margin:0; top:0; left:0; width: 100%; height: 100%; background:rgba(255,255,255,1); }	
        .centered { position: fixed; top: 10%; left: 50%; transform: translate(-50%, -50%); font-size: 30px; }
        .summary-container { padding: 15px; border-bottom: 1px dotted #ddd; }
        .report-title { font: bold 30px Arial, sans-serif; }	
        .time { color: #666; font: small-caps 12px Arial, sans-serif; padding: 2px 0 15px 0; }
        .stats { font: small-caps 14px Arial, sans-serif; padding-right: 12px; }
        .stats-no-padding { font: small-caps 14px Arial, sans-serif; }
        .passed { color: #2b8013;}
        .failed { color: #cf4023; }    
        .button { 
            background-color:#ebe7dd; 
            color: #555; 
            font: bold 12px Arial, sans-serif; 
            display: inline-block; 
            text-align: center; 
            text-decoration: none; 
            cursor: pointer; 
            padding: 7px 10px;
            border: 3px solid #c7c5bf		
        }
        .button:hover { border: 3px solid #7a7974; color: #777; }	
        #bstack-box { z-index:10; border: 5px solid; position: absolute; background:#fff; width: 75vw; height: 75vh; 
            top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 10px; display: none;}
        #bstack-screen { z-index:1; position:fixed; padding:0; margin:0; top:0; left:0; width: 100%; height: 100%; background:rgba(100,100,100,.7); display: none;}	
        #bstack-table {  width: 90%; padding: 20px;  }
        #bstack-table td { padding: 5px 10px; }
        #bstack-table .index { text-align: right; width: 60px; }
        #bstack-table .bstack-links { text-decoration: none; cursor: pointer; color: #0b729e; }
        #bstack-table .bstack-links:hover { color: #45a7d1; }
        #bstack-table tr { height: 50px; }
        #bstack-table tr.odd { background-color: #faf9f5; }
        #bstack-table tr.even { background-color: #f0efe9; }
        #bstack-box-title { font: small-caps bold 32px Arial, sans-serif; color: #666; }
        #filter { width: 500px; height:30px; }
        </style>
    </head>
    <body>
    <div id="alert"></div>
    <div id="content">
        <span class="spinner">
            <span class="spinner__circle"></span>
        </span>
    </div>
    <div id="popup"></div>
    <div id="load-screen">
        <span class="centered">Loading report. Please wait...</span>
    </div>
    <div id="bstack-screen"></div>   
    <div id="bstack-box">
        <div style="max-height: 12%; display:flex; justify-content:space-between; align-items: center; padding: 15px 5px; border-bottom: 1px solid #efefef;">            
            <span id="bstack-box-title">${bStackBoxTitle}</span>
            <span class="button" onclick="closeBStackBox()">Close Window</span>
        </div>
        <div style="margin:20px;">
            Filter results: <input id="filter" onkeyup="filter(this)"/>
        </div>
        <div style="width: 70vw; max-height: 85%; overflow: auto; margin:20px;">
            <table id="bstack-table"></table>
        </div>
    </div> 
    <script src="app.js"></script>
        <script src="plugins/behaviors/index.js"></script>
        <script src="plugins/packages/index.js"></script>
        <script src="plugins/screen-diff/index.js"></script>    
        <script>		
            const _$ = (e) => document.getElementById(e);
            const bStackBuildId = '${bStackBuildId}';
            const bStackData = ${sessions};
            window.addEventListener('DOMContentLoaded', init);		
            function init() {
                let url = window.location.href;			
                if (!url.endsWith('#suites')) {		
                    window.location.href = url + '#suites';		
                    window.location.reload();	
                    return;		
                }		
                setTimeout(customize, 2000);
            }

            function closeBStackBox() {
                _$('bstack-screen').style.display = _$('bstack-box').style.display = 'none';
            }

            function showBStackBox() {
                _$('bstack-screen').style.display = _$('bstack-box').style.display = 'block';
            }

            function buildBStackBox() {
                let table = _$('bstack-table');	
                let content = '';
                for (let i = 0; i < bStackData.length; i++) {
                    let trStyle = i % 2 == 0 ? 'even' : 'odd';
                    let name = bStackData[i].name;
                    let url = bStackData[i].link;
                    content += '<tr name="' + name.toLowerCase() + '" class="' + trStyle + '"><td class="index">' + (i + 1) + '.</td><td><a class="bstack-links" target="_blank" href="' + url + '">' + name + '</a></td></tr>';
                }
                table.innerHTML = content;
            }

            function removeFilterButtons() {
                ['broken', 'skipped', 'unknown'].forEach(stat => {                    
                    let e = document.querySelector('div span[data-status="' + stat + '"]');
                    if (e) e.remove();                    
                });
            }		

            function customize() {	
                document.getElementsByClassName('app__nav')[0].remove();				
                document.getElementsByClassName('pane__title-text')[0].innerHTML = 'Results';	                
                let div = document.createElement('div');
                div.innerHTML = \`               
                    <div class="summary-container">
                        <div class="report-title">${reportTitle}</div>
                        <div class="time">${exectuionTS}</div>
                        <div style="margin-bottom: 10px; display: ${!bStackBuildId ? 'none' : 'block'}">
                            <span class="stats-no-padding">duration: </span><b>${testDuration}</b>
                        </div>
                        <span class="stats">test cases executed: <b>${stats.total}</b></span>
                        <span class="stats passed">passed: <b>${stats.passed}</b></span>
                        <span class="stats failed">failed: <b>${stats.failed}</b></span>   
                        <span class="stats">(test cases covered: <b>${stats.tagCount}</b>)</span>                 
                        <div style="margin-top: 10px; display: ${!bStackBuildId ? 'none' : 'block'}">
                            <span class="button" onclick="showBStackBox()">BrowserStack Video Links</span>
                        </div>
                    </div>                    
                \`; 				
                let leftPanel = document.getElementsByClassName('side-by-side__left')[0];
                leftPanel.insertBefore(div, leftPanel.children[0]);		
                buildBStackBox();	
                removeFilterButtons();
                document.querySelector('div[class="tree__filter"]').addEventListener('DOMNodeInserted', () => removeFilterButtons());
                document.getElementById('load-screen').style.display = 'none';			
            }
            
            function filter(e) {
                let text = e.value;
                if (text.trim() == '') {
                    showAllRows(true);
                    return;
                }
                text = text.toLowerCase();
                showAllRows(false);
                document.querySelectorAll('#bstack-table > * > tr').forEach(tr => {
                    if (tr.getAttribute('name').indexOf(text) > -1)
                        tr.style.display = 'block';
                });
            }

            function showAllRows(flag) {
                document.querySelectorAll('#bstack-table > * > tr').forEach(tr => tr.style.display = flag ? 'block' : 'none');
            }
            
        </script>
    </body>
    </html>
    `;
}

function buildAndTransportArtifacts() {
    fs.writeFileSync(`allure-report/index.html`, html);
    fs.cpSync(`allure-report`, `customized-allure-report/allure-report/allure-report`, {recursive: true});
    zipLocal.sync.zip(`customized-allure-report/allure-report`).compress().save(`customized-report.zip`);

    // copy the newly generated zip to the build archives of the this Jenkins job for the allure plugin to consume
    let destinationFile = `${env.JENKINS_HOME}/jobs/${env.JOB_NAME}/builds/${env.BUILD_NUMBER}/archive/allure-report.zip`;
    fs.copyFileSync(`customized-report.zip`, destinationFile);
}


async function buildReportUsingAllureAndBStackData(buildId) {  
    if (buildId) {
        const credentials = Buffer.from(`${env.BROWSERSTACK_USERNAME}:${env.BROWSERSTACK_ACCESS_KEY}`).toString('base64');
        const auth = {"Authorization": `Basic ${credentials}`};
        let response = await fetch(`https://api.browserstack.com/automate/builds/${buildId}.json`, {headers: auth});
        let buildInfo = await response.json();       
        testDuration = getFormattedDurationTime(buildInfo.build.automation_build.duration);
    }    
    buildHtml();
    buildAndTransportArtifacts();           
}

async function generateReport() {
    await buildReportUsingAllureAndBStackData(bStackBuildId);
}