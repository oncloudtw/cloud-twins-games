const fs = require('fs');

try {
    const html = fs.readFileSync('advanced/fill_in_the_blank.html', 'utf8');
    const match = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (!match) {
        console.log("No script tag found");
        process.exit(1);
    }
    const jsCode = match[1];
    
    // Test syntax
    const vm = require('vm');
    new vm.Script(jsCode);
    console.log("Syntax is OK!");
} catch (e) {
    console.error("Syntax Error:", e);
}
