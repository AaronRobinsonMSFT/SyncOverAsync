// BEGIN Communication contract - shared constants.
const STATE_IDX = 0;
const MSG_SIZE_IDX = 1;

const STATE_IDLE = 0;
const STATE_REQ = 1;
const STATE_RESP = 2;
const STATE_REQ_P = 3; // Request has multiple parts
const STATE_RESP_P = 4; // Response has multiple parts
const STATE_AWAIT = 5; // Awaiting the next part
// END Communication contract - shared constants.

// Operation to perform.
async function async_call(msg) {

    // Crypto call that uses Promises
    var keyPair = await self.crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256",
        },
        true,
        ["encrypt", "decrypt"]
    );

    return msg.split("").reverse().join("");
}

var s_comm;
var s_msg;
var s_msg_char_len;

function write_to_msg(input, start, input_len) {
    var mi = 0;
    var ii = start;
    while (mi < s_msg_char_len && ii < input_len) {
        s_msg[mi] = input.charCodeAt(ii);
        ii++; // Next character
        mi++; // Next buffer index
    }

    return ii - start;
}

function read_from_msg(begin, end) {
    return String.fromCharCode.apply(null, s_msg.slice(begin, end));
}

function read_request() {
    var request = "";

    for (;;) {
        // Get the current state and message size
        var state = Atomics.load(s_comm, STATE_IDX);
        var size_to_read = Atomics.load(s_comm, MSG_SIZE_IDX);

        // Append the latest part of the message.
        request += read_from_msg(0, size_to_read);

        // The request is complete.
        if (state === STATE_REQ)
            break;

        // Reset the size and transition to await state.
        Atomics.store(s_comm, MSG_SIZE_IDX, 0);
        Atomics.store(s_comm, STATE_IDX, STATE_AWAIT);
        Atomics.wait(s_comm, STATE_IDX, STATE_AWAIT);
    }

    return request;
}

function send_response(msg) {
    if (Atomics.load(s_comm, STATE_IDX) !== STATE_REQ)
        throw "WORKER: Invalid sync communication channel state.";

    var state; // State machine variable
    const msg_len = msg.length;
    var msg_written = 0;

    for (;;) {
        // Write the message and return how much was written.
        var wrote = write_to_msg(msg, msg_written, msg_len);
        msg_written += wrote;

        // Indicate how much was written to the s_msg buffer.
        Atomics.store(s_comm, MSG_SIZE_IDX, wrote);

        // Indicate if this was the whole message or part of it.
        state = msg_written === msg_len ? STATE_RESP : STATE_RESP_P;

        // Update the state
        Atomics.store(s_comm, STATE_IDX, state);

        // Wait for the transition to know the main thread has
        // received the response by moving onto a new state.
        Atomics.wait(s_comm, STATE_IDX, state);

        // Done sending response.
        if (state === STATE_RESP)
            break;
    }
}

async function await_request() {
    console.log("await_request()");

    for (;;) {
        // Wait for signal to perform operation
        Atomics.wait(s_comm, STATE_IDX, STATE_IDLE);

        // Read in request
        var req = read_request();
        console.log("Request: " + req);

        // Perform async action based on request
        var resp = await async_call(req);

        // Send response
        send_response(resp);
    }
}

// Initialize WebWorker
onmessage = function (p) {
    console.log(p.data.salutation);
    s_comm = new Int32Array(p.data.comm_buf);
    s_msg = new Uint16Array(p.data.msg_buf);
    s_msg_char_len = p.data.msg_char_len;

    await_request();
}
