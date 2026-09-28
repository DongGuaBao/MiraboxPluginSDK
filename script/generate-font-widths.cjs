const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "tools", "font-width-generator");
const build = path.join(root, "build", "font-width-generator");
const output = path.join(root, "src", "generated", "font-widths.ts");
const qtRoot = process.env.QT_ROOT || "C:\\Qt\\5.15.2\\msvc2019_64";
const qmake = path.join(qtRoot, "bin", "qmake.exe");
const vswhere = "C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe";

function run(command, args, options = {}) {
    const result = spawnSync(command, args, { stdio: "inherit", windowsHide: true, ...options });
    if (result.status !== 0) process.exit(result.status ?? 1);
}

function developerEnvironment(environmentScript) {
    let installation = "";
    if (fs.existsSync(vswhere)) {
        const result = spawnSync(vswhere, ["-latest", "-products", "*", "-property", "installationPath"], { encoding: "utf8", windowsHide: true });
        installation = result.stdout.trim();
    }
    const vcvars = process.env.VCVARS64 || path.join(installation, "VC", "Auxiliary", "Build", "vcvars64.bat");
    if (!installation || !fs.existsSync(vcvars)) throw new Error("Visual Studio x64 C++ build environment was not found");
    fs.writeFileSync(environmentScript, `@call "${vcvars}" >nul\r\n@set\r\n`, "utf8");
    const result = spawnSync("cmd.exe", ["/d", "/c", environmentScript], { encoding: "utf8", windowsHide: true });
    if (result.status !== 0) throw new Error(`Unable to initialize the Visual Studio C++ environment: ${result.stderr.trim()}`);
    const environment = { ...process.env };
    for (const line of result.stdout.split(/\r?\n/)) {
        const separator = line.indexOf('=');
        if (separator > 0) environment[line.slice(0, separator)] = line.slice(separator + 1);
    }
    return environment;
}

if (!fs.existsSync(qmake)) throw new Error(`Qt 5.15.2 qmake not found: ${qmake}`);
fs.rmSync(build, { recursive: true, force: true });
fs.mkdirSync(build, { recursive: true });
fs.mkdirSync(path.dirname(output), { recursive: true });
const buildEnvironment = developerEnvironment(path.join(build, "environment.cmd"));
run(qmake, [path.join(source, "font-width-generator.pro"), "-tp", "vc"], { cwd: build, env: buildEnvironment });
const project = path.join(build, "font-width-generator.vcxproj");
run("msbuild.exe", [project, "/m", "/p:Configuration=Release", "/p:Platform=x64", "/p:PlatformToolset=v145", "/v:minimal", "/nologo"], { cwd: build, env: buildEnvironment });
const executable = path.join(build, "release", "font-width-generator.exe");
const validationArgument = process.argv.find((argument) => argument.startsWith("--validate="));
const executableArguments = validationArgument
    ? ["--validate", path.resolve(validationArgument.slice("--validate=".length))]
    : [output];
run(executable, executableArguments, {
    cwd: root,
    env: { ...buildEnvironment, PATH: `${path.join(qtRoot, "bin")};${buildEnvironment.PATH || ""}` },
});
fs.rmSync(build, { recursive: true, force: true });
console.log(validationArgument ? "Generated Qt validation measurements" : `Generated ${output}`);
