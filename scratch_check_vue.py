import re
import sys

def main():
    try:
        with open('advanced/fill_in_the_blank.html', 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print("Error reading file:", e)
        return

    # Extract template and script parts
    parts = content.split('<script>')
    if len(parts) < 2:
        print("No script tag found")
        return
    template = parts[0]
    script = parts[1].split('</script>')[0]

    # Extract variables used in template
    # {{ var.name }}
    mustache_vars = re.findall(r'\{\{\s*([\w]+)[^\}]*\}\}', template)
    
    # v-if="var" v-model="var" @click="var"
    directive_vars = re.findall(r'(?:v-model|v-if|@click|v-for|:class|:disabled|:key)="([^"]+)"', template)
    
    used_vars = set()
    for v in mustache_vars:
        used_vars.add(v)
    
    for expr in directive_vars:
        # crude extraction of identifiers
        idents = re.findall(r'\b[a-zA-Z_]\w*\b', expr)
        for i in idents:
            # ignore js keywords and true/false
            if i not in ['true', 'false', 'null', 'undefined', 'in', 'of', 'typeof', 'Math', 'parseInt', 'Array', 'String', 'Number', 'console', 'window', 'document', 'length', 'size']:
                used_vars.add(i)

    # Extract returned variables from setup()
    return_block = re.search(r'return\s*\{([^}]+)\}', script)
    if not return_block:
        print("No return block found in setup")
        return
    
    returned = set(re.findall(r'\b([a-zA-Z_]\w*)\b', return_block.group(1)))
    
    print("Missing exports:")
    for v in sorted(used_vars):
        if v not in returned:
            print("-", v)

if __name__ == "__main__":
    main()
