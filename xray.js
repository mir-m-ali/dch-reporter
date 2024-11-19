module.exports = generateXrayResults;

const fs = require('fs');

function formatTime(item, startOrStopTime) {
    if (!item) return '';
    let time = startOrStopTime == 'stop' ? item.time.stop : item.time.start;
    return new Date(parseInt(time));
}


function generateXrayResults(testPlanId) {
    if (!fs.existsSync(`${process.env.WORKSPACE}/test-case-mappings.json`)) {
        console.log('Xray results will not be generated. test-case-mappings.json is not present');
        return;
    }

    testPlanId = testPlanId.replace('@', '');

    const TEST_RESULTS = `${process.env.WORKSPACE}/allure-report/data/behaviors.json`;
    const testCaseIds = JSON.parse(fs.readFileSync(`${process.env.WORKSPACE}/test-case-mappings.json`))[testPlanId];

    if (!testCaseIds || testCaseIds.length == 0) {
        console.log(`xray-test-results.json could not be generated since no requirement mapping exists for ${testPlanId}`);    
        process.exit(-1);
    }   

    fs.readFile(TEST_RESULTS, 'utf8', (error, data) => {
        if (error) {
            console.log('xray-test-results.json could not be generated...', error);
            return;
        }

        // just grab tags, status, and time attributes    
        let testCases = (JSON.parse(data)).children;    
        if (!testCases) {
            console.log('no test cases to process');
            return;        
        }
        //console.log(`found ${testCases.length} cases`);
        let _tests = [];    
        testCases.forEach(tc => {        
            let tag = '';
            for (let i = 0; i < testCaseIds.length; i++) {            
                if (tc.tags.includes(testCaseIds[i])) {
                    tag = testCaseIds[i].replace('@', '');
                    break;                
                }
            }
            if (tag == '') return;
            _tests.push({                       
                testKey: tag,            
                start: formatTime(tc, 'start'),
                finish: formatTime(tc, 'stop'),
                status: tc.status == 'passed' || tc.status == 'failed' ? tc.status : 'TO DO'
            });
        });

        let xRay = {        
            info: {
                    summary: `Test Execution for Test Plan ${testPlanId}`,
                    description: `${process.env.BUILD_URL}allure/#suites`,                
                    startDate: formatTime(testCases[0], 'start'),
                    finishDate: formatTime(testCases[testCases.length - 1], 'stop'),
                    testPlanKey: `${testPlanId}`
                },
            tests: _tests
        };    

        let dir = `${process.env.WORKSPACE}/xray`;
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir);    
        
        // write the json to file
        fs.writeFile(`${dir}/xray-test-results.json`, JSON.stringify(xRay), (error) => {
            if (error) {
                console.log(error);
                return;
            }
            console.log('xray-test-results.json was successfully generated');            
        });
    });
}