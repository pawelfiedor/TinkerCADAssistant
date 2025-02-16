let commands = {}
let registerCommand = (command) => {
    commands[command.command] = command
}
/**
 * Utility to make sure the extension is still not reloaded to prevent the extension once reloaded not throwing exceptions :)
 * @param message Weather a message should be sent when this happens
 * @returns Returns if it is active or not.
 */
let isActive = (message = false) => {
    if (message) console.log("Extension was reloaded, no exception thrown")
    return chrome.runtime?.id

}
/**
 * Send a command to the service worker
 * @param command Command to run
 * @param onComplete Response from command.
 */
let sendCommand = (command, onComplete) => {
    if (!isActive()) {

        return
    }

    chrome.runtime.sendMessage({value: command.join("(SPLIT)")}, (response) => {
        onComplete(response)

    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message) {
        let og = message.value

        let args = og.split("(SPLIT)")
        let command = commands[args[0]]
        if (command === undefined) {
            return false
        }
        //Actually running command's action using the arguments provided with the sendResponse back
        command.action(args, sendResponse)

    }
    return true;
});


registerCommand({
    // project.id, project.name, directoryName, format
    command: "download", action: (args, sendResponse) => {

        console.log(args[2])

        chrome.downloads.download({
            url: `https://csg.tinkercad.com/things/${args[1]}/polysoup.${args[4]}?rev=-1`,
            filename: `${args[3]}/${args[2]}.${args[4]}`
        }, function (id) {
            sendResponse(`Downloaded: ${args[1]}`)
        });
        setTimeout(function () {
        }, 500);
    }
})

registerCommand({
    command: "url", action: (args, sendResponse) => {
        chrome.tabs.query({active: true, lastFocusedWindow: true}).then(r => {
            if (r[0])
                sendResponse(r[0].url)

        })

    }
})


registerCommand({
    command: "reload", action: (args, sendResponse) => {
        chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
            chrome.tabs.update(tabs[0].id, {url: tabs[0].url});
        })
    }
})
registerCommand({
    command: "open", action: (args, sendResponse) => {
        chrome.tabs.create({url: args[1], active: false});
    }
})

registerCommand({
    command: "api2", action: (args, sendResponse) => {

        chrome.tabs.query({active: false, currentWindow: true}, function (tabs) {
            let toggle = false

            for (const tab of tabs) {

                if (tab.url.match("https://api-reader.tinkercad.com")) {
                    toggle = true
                    chrome.tabs.sendMessage(tab.id, {value: args.join("(SPLIT)")});

                    sendResponse()
                    break
                }

            }


        })


    }
})

registerCommand({
    command: "api", action: (args, sendResponse) => {
        chrome.tabs.query({active: false, currentWindow: true}, function (tabs) {
            let toggle = false
            for (const tab of tabs) {
                if (tab.url.match("https://api-reader.tinkercad.com")) {
                    toggle = true

                }

            }
            if (!toggle) {
                chrome.tabs.create({url: "https://api-reader.tinkercad.com/", active: false}, (tab) => {
                    console.log("API window opened")
                    sendResponse()
                });
            } else {
                sendResponse()
            }

        })


    }
})

// Check whether new version is installed
chrome.runtime.onInstalled.addListener(function (details) {
    // chrome.tabs.create({url: chrome.runtime.getURL('intro.html')});
})