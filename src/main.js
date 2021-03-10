// Index constants for the communication buffer.
const STATE_IDX = 0;
const MSG_SIZE_IDX = 1;
const COMM_LAST_IDX = MSG_SIZE_IDX;

// Communication states.
const STATE_IDLE = 0;
const STATE_REQ = 1;
const STATE_RESP = 2;
const STATE_REQ_P = 3; // Request has multiple parts
const STATE_RESP_P = 4; // Response has multiple parts
const STATE_AWAIT = 5; // Awaiting the next part

const s_integer_in_bytes = 4;
const s_comm_byte_len = s_integer_in_bytes * (COMM_LAST_IDX + 1);
var s_comm_buf = new SharedArrayBuffer(s_comm_byte_len);

// JavaScript character encoding is UTF-16.
const s_char_in_bytes = 2;
const s_msg_char_len = 1024; // Default size is arbitrary but is in 'char' units (i.e. UTF-16 code points).
const s_msg_byte_len = s_char_in_bytes * s_msg_char_len;
var s_msg_buf = new SharedArrayBuffer(s_msg_byte_len);

var s_worker;
var s_comm; // Communication buffer
var s_msg;  // Message buffer

function init() {
    s_worker = new Worker("worker.js");
    s_worker.postMessage(
        {
            salutation:"Message from main",
            comm_buf: s_comm_buf,
            msg_buf: s_msg_buf,
            msg_char_len: s_msg_char_len
        });

    s_comm = new Int32Array(s_comm_buf);
    s_msg = new Uint16Array(s_msg_buf);
}

function do_it() {
    console.log("do_it(): Before");

    var resp = sync_msg_send("12345");
    console.log("Response: " + resp);

    console.log("do_it(): After");
}

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

function send_request(msg) {
    var state;
    const msg_len = msg.length;
    var msg_written = 0;

    for (;;) {
        // Write the message and return how much was written.
        var wrote = write_to_msg(msg, msg_written, msg_len);
        msg_written += wrote;

        // Indicate how much was written to the s_msg buffer.
        Atomics.store(s_comm, MSG_SIZE_IDX, wrote);

        // Indicate if this was the whole message or part of it.
        state = msg_written === msg_len ? STATE_REQ : STATE_REQ_P;

        // Notify webworker
        Atomics.store(s_comm, STATE_IDX, state);
        Atomics.notify(s_comm, STATE_IDX);

        // The send message is complete.
        if (state === STATE_REQ)
            break;

        // Wait for the worker to be ready for the next part.
        //  - Atomics.wait() is not permissible on the main thread.
        do {
            state = Atomics.load(s_comm, STATE_IDX);
        } while (state !== STATE_AWAIT);
    }
}

function read_response() {
    var state;
    var response = "";

    for (;;) {
        // Wait for webworker response.
        //  - Atomics.wait() is not permissible on the main thread.
        do {
            state = Atomics.load(s_comm, STATE_IDX);
        } while (state !== STATE_RESP && state !== STATE_RESP_P);

        var size_to_read = Atomics.load(s_comm, MSG_SIZE_IDX);

        // Append the latest part of the message.
        response += read_from_msg(0, size_to_read);

        // The response is complete.
        if (state === STATE_RESP)
            break;

        // Reset the size and transition to await state.
        Atomics.store(s_comm, MSG_SIZE_IDX, 0);
        Atomics.store(s_comm, STATE_IDX, STATE_AWAIT);
        Atomics.notify(s_comm, STATE_IDX);
    }

    // Reset the communication channel's state and let the
    // webworker know we are done.
    Atomics.store(s_comm, STATE_IDX, STATE_IDLE);
    Atomics.notify(s_comm, STATE_IDX);

    return response;
}

function sync_msg_send(msg) {
    if (Atomics.load(s_comm, STATE_IDX) !== STATE_IDLE)
        throw "MAIN: Invalid sync communication channel state.";

    send_request(msg);

    return read_response();
}