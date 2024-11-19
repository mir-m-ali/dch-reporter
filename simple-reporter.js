module.exports = generateSimpleReport;

let env = process.env;
let args = process.argv;

let dataSrcPath = env.JENKINS_HOME ? 'allure-report/data' : '';
args.forEach(a => {
    if (a.startsWith('--data-src-path')) {
        let path = a.split('=')[1];
        if (!path) return;
        dataSrcPath = path;
    }
})

if (!dataSrcPath) {
    console.log('Exiting. No data source path provider. Use --data-src-path');
    process.exit(-1);
}

const fs = require('fs');
const zipLocal = require('zip-local');

let reportTitle = env.REPORT_TITLE ? env.REPORT_TITLE.trim() : '';
let tags = env.TAGS;
if (tags) tags = tags.replace(/[|]/g, ',');
if (!reportTitle && env.JENKINS_HOME) reportTitle = `${env.job_name} Report for ${tags}`;

function getTimeFromMilliseconds(ms) {
    let h = 0, m = 0, s = 0, totalSeconds = (ms - (ms % 1000))/1000;    
    s = totalSeconds % 60;
    let minutes = m = (totalSeconds - s)/60;
    if (minutes > 60) {
        m = minutes % 60;
        h = (minutes - m)/60;
    }
    return `${h}h ${m}m ${s}s`;
}

let testCasesAndSteps = [];

let testCases = JSON.parse(
        fs.readFileSync(`${dataSrcPath}/behaviors.json`, {encoding: 'utf8'})
    ).children;
let stats = {
    total: testCases.length,
    startTime: (new Date(parseInt(testCases[0]?.time.start))).toString().toLowerCase(),
    passed: 0,
    failed: 0,
    totalDuration: getTimeFromMilliseconds(testCases.reduce((total, tc) => total + tc.time.duration, 0))
};

let imgList = [];
testCases.forEach(tc => {
    if (tc.status == 'passed') stats.passed++;
    else stats.failed++; 
    // read the steps and get screenshot info
    let obj = JSON.parse(fs.readFileSync(`${dataSrcPath}/test-cases/${tc.uid}.json`, {encoding: 'utf8'}));
    if (obj.testStage === undefined) return;
    let testCase = {};        
    let i = obj.name.indexOf('@');
    testCase.name = i ? obj.name.substring(0, i - 1).trim() : obj.name.trim();
    i = obj.fullName.indexOf('@');
    testCase.feature = i ? obj.fullName.substring(0, i - 1).trim() : obj.fullName.trim();     
    testCase.tags =  obj.extra.tags.sort(); 
    testCase.psmTags = obj.extra.tags.filter(t => t.includes('@PSM')).sort().toString();    
    testCase.status = obj.testStage.status;
    testCase.duration = getTimeFromMilliseconds(obj.time.duration);
    testCase.steps = [];    
    let steps = obj.testStage.steps;
    steps.forEach(s => {
        let step = {}
        step.name = s.name.replace(/""/g, '');
        step.status = s.status;
        step.imgSrc = s.steps?.length > 0 && s.steps[s.steps.length - 1].attachments?.length > 0 ? s.steps[s.steps.length - 1].attachments[0].source : '';
        
        // grab only the needed images
        if (step.imgSrc) imgList.push(step.imgSrc);

        testCase.steps.push(step);
    });
    testCasesAndSteps.push(testCase);
});

function compare(a, b) {
    return a.psmTags < b.psmTags ? -1 : (a.psmTags > b.psmTags ? 1 : 0);
}

testCasesAndSteps.sort(compare);

// create the new simple-report directory and copy the relevant images there. The new index.html will be created in /simple-report
if (!fs.existsSync('simple-report')) fs.mkdirSync('simple-report');
if (!fs.existsSync('simple-report/attachments')) fs.mkdirSync('simple-report/attachments');

imgList.forEach(img => {
    fs.copyFileSync(`${dataSrcPath}/attachments/${img}`, `simple-report/attachments/${img}`);
});

let html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        * { font: 13px Arial, sans-serif; }
        .summary-container { padding: 15px; border-bottom: 1px dotted #ddd; height: 9vh; font: 12px Arial, sans-serif; overflow-y: auto; }
        .report-title { font: bold 30px Arial, sans-serif; }	
        .time { color: #666; font: small-caps 12px Arial, sans-serif; padding: 2px 0 15px 0; }
        .stats { font: small-caps 14px Arial, sans-serif; padding-right: 12px; }
        .stats-no-padding { font: small-caps 14px Arial, sans-serif; }
        .title-1 { font: bold 20px Arial, sans-serif; padding: 15px 0 10px 0; }
        .title-2 { font: bold 16px Arial, sans-serif; padding: 15px 0 10px 0; }
        .duration { font: small-caps 14px Arial, sans-serif; margin: 0 0 10px 0; }
        .tag { background-color:#0e6cc9; color: white; font-weight: bold; padding: 3px 6px; margin: 0 5px; border-radius: 6px;}
        .pass-label, .fail-label { padding: 5px 10px; font: bold 12px Arial, sans-serif; color: white; border-radius: 6px; letter-spacing: 1px; }
        .pass-label { background-color: green; }
        .fail-label { background-color: red; }
        .passed { color: #2b8013; }
        .failed { color: #cf4023; }  
        .passed-symbol, .failed-symbol { display: inline-block; padding: 3px 5px; font: bold 10px Arial, sans-serif; color: white; text-align: center; }
        .passed-symbol { background-color: green; }
        .failed-symbol { background-color: red; }
        .passed-symbol:before { content: 'P';}
        .failed-symbol:before { content: 'F';}
        table { border-collapse: collapse; font: 12px Arial, sans-serif; width: 100%;}
        td { padding: 25px 5px 5px 3px; border-bottom:1px dotted #dedede; }
        tr:hover { cursor: pointer; background-color: #ececec; }
        .container { display: flex; flex-direction: row; justify-content: space-between; height: 96vh;}
        #left-col { width: 40vw; height:95vh; border-right: 1px dotted #ccc;}
        #right-col { width: 58vw; height:95vh; overflow-y: auto;}
        img { max-height:450px; max-width:1000px; margin:10px 0 15px 50px; display:none; }
        .flex { display:flex; align-items: center; gap: 10px; }
        .align-items-top { align-items: flex-start; }
        .block-height { padding: 25px 0 5px 0; }
        .screen-shot-expanded, .screen-shot-collapsed { margin-top: 5px; font: italic 11px Arial, sans-serif; color: #555; }
        .screen-shot-expanded:hover, .screen-shot-collapsed:hover { cursor: pointer; color: #999; }
        .screen-shot-expanded:before { content: '- Hide Screenshot'; }
        .screen-shot-collapsed:before { content: '+ Open Screenshot'; }
        .tag-text { font: bold 12px Arial, sans-serif; padding-right: 10px; color:#275dab;}
    </style>

    <script>
        function showOrHideScreenshot(elem, imgId) {
            let collapsed = elem.className.indexOf('collapsed') > -1;
            elem.className = collapsed ?  'screen-shot-expanded' : 'screen-shot-collapsed';
        document.getElementById(imgId).style.display = collapsed ? 'block' : 'none';
        }

        function loadSteps(tcStepsId) {        
            document.querySelectorAll('#right-col > .test-case-steps').forEach(item => item.style.display = 'none');
            document.getElementById(tcStepsId).style.display = 'block';
        }

        function filter(e) {        
            let text = e.value;
            if (text.trim() == '') {
                showAllTestCases(true);
                return;
            }
            text = text.toLowerCase();
            showAllTestCases(false);
            document.querySelectorAll('#test-case-table > * > tr').forEach(tr => {
                if (tr.getAttribute('name').indexOf(text) > -1)
                    tr.style.display = 'block';
            });
        }

        function showAllTestCases(flag) {
            document.querySelectorAll('#test-case-table > * > tr').forEach(tr => tr.style.display = flag ? 'block' : 'none');
        }

    </script>

</head>
<body onload="loadSteps('tc-steps-1')">    
`;

let leftCol = `        
    <div class="summary-container">
        <div class="report-title">PSM Report for @PSM-2988</div>
        <div class="time">${stats.startTime}</div>        
        <span class="stats">test cases executed: <b>${stats.total}</b></span>
        <span class="stats passed">passed: <b>${stats.passed}</b></span>
        <span class="stats failed">failed: <b>${stats.failed}</b></span>
        <span class="stats-no-padding">total duration: <b>${stats.totalDuration}</b></span>                  
    </div>     
    <div class="flex">
    <div class="title-1">Results</div> 
        <input style="height:25px; width:80%;" onkeyup="filter(this)"/>
    </div>
    <table>
`;
let rightCol = ``;
let tcNum = 0;
testCasesAndSteps.forEach(tc => {

    let tcStepsId = `tc-steps-${++tcNum}`;
    let passOrFail = tc.status == 'passed' ? `<div class="pass-label">Passed</div>` : `<div class="fail-label">Failed</div>`;
    let passOrFailSymbol = tc.status == 'passed' ? `<div class="passed-symbol"></div>` : `<div class="failed-symbol"></div>`

    leftCol += `
        <tr name="${tc.psmTags.toString().toLowerCase()} ${tc.name.toLowerCase()}" onclick="loadSteps('${tcStepsId}')">
            <td style="width:40px;">${tcNum}.</td>
            <td><div class="flex">${passOrFailSymbol} <div><span class="tag-text">${tc.psmTags}</span> ${tc.name}</div></td>
            <td style="text-align: right; width:70px;">${tc.duration}</td>
        </tr>
    `;            
    
    let tags = 'Tags:';
    tc.tags.forEach(t => tags += `<span class="tag">${t}</span>`);
    
    let div = `
            <div class="test-case-steps" id="${tcStepsId}" style="display:none">
                <div class="summary-container">                            
                    <div class="flex">
                        ${passOrFail} <div class="title-1">${tc.name}</div>
                    </div>                            
                    <div class="duration">duration: ${tc.duration}</div>        
                    <div>${tags}</div>                                    
                </div>
                <div class="title-2">Test Body Execution</div>
        `;
    let stepNum = 0;
    tc.steps.forEach(step => {                
        let imgId = `${tcStepsId}-img-${++stepNum}`;
        passOrFailSymbol = step.status == 'passed' ? `<div class="passed-symbol"></div>` : `<div class="failed-symbol"></div>`;
        div += `
            <div class="flex block-height align-items-top">
                ${passOrFailSymbol} 
                <div>
                    ${step.name} 
                    <div onclick="showOrHideScreenshot(this, '${imgId}')" class="screen-shot-collapsed"></div>
                    <img id="${imgId}" src="attachments/${step.imgSrc}">
                </div>
            </div>`;
    });
    div += `</div>`;    
    rightCol += div;
});
leftCol += '</table>';

html += `
    <div class="container">
        <div id="left-col">${leftCol}</div>
        <div id="right-col">${rightCol}</div>
    </div>
</body>
`;

function generateSimpleReport() {
    fs.writeFileSync(`simple-report/index.html`, html);
    zipLocal.sync.zip(`simple-report`).compress().save(`simple-report.zip`);
    
    if (!env.JENKINS_HOME) return;

    // copy the newly generated zip to the build archives of the this Jenkins job
    let destinationFile = `${env.JENKINS_HOME}/jobs/${env.JOB_NAME}/builds/${env.BUILD_NUMBER}/archive/simple-report.zip`;
    fs.copyFileSync(`simple-report.zip`, destinationFile);    
    
}
