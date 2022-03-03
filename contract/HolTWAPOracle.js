(* SPDX-License-Identifier: MIT *)
scilla_version 0

(***************************************************)
(*               Associated library                *)
(***************************************************)
import IntUtils

library HolTWAPOracle
let one = Uint256 1
let zero = Uint128 0
(* Dummy user-defined ADT *)
(* Error events *)
type Error =
| CodeIsOwner
| CodeIsPendingRequest

let random =
    fun (entropy: Uint256) =>
    fun (block_number: BNum) =>
    fun (addr: ByStr20) =>
        let addr_hash = builtin keccak256hash addr in
        let entropy_hash = builtin keccak256hash entropy in
        let blockhash = builtin keccak256hash block_number in
        let ehash = builtin concat entropy_hash blockhash in
        let ahash = builtin concat ehash addr_hash in
        let last_hash = builtin concat ehash ahash in
        let hash = builtin keccak256hash last_hash in
            builtin to_uint256 hash

let make_error =
    fun (result : Error) =>
        let result_code = 
        match result with
        | CodeIsOwner               => Int32 -1
        | CodeIsPendingRequest      => Int32 -2
        end
        in
        { _exception : "Error"; code : result_code }

let one_msg = 
    fun (msg : Message) => 
        let nil_msg = Nil {Message} in
        Cons {Message} msg nil_msg       

(***************************************************)
(*             The contract definition             *)
(***************************************************)
contract HolTWAPOracle 
(
    contract_owner: ByStr20
)

(* Mutable fields *)
field randNonce: Uint256 = Uint256 0
field modulus: Uint256 = Uint256 1000
field pendingRequests: Map Uint256 Bool = Emp Uint256 Bool

(**************************************)
(*             Procedures             *)
(**************************************)

procedure Throw(error: Error)
    e = make_error error;
    throw e
end

procedure IsNotOwner(address: ByStr20)
    is_owner = builtin eq contract_owner address;
    match is_owner with
    | False =>
        err = CodeIsOwner;
        ThrowError err
    | True =>
    end
end


(***************************************)
(*             Transitions             *)
(***************************************)

(* @dev: Generate random requset id and then returns it to the caller contract by invoking "receiveRequestId" transition  *)
transition getTWAPPrice()
    cur_nonce = randNonceTemp <- randNonce in
        builtin add randNonceTemp one;
    randNonce := cur_nonce;
    blk <- & BLOCKNUMBER;
    id = random(cur_nonce, blk, _sender);
    pendingRequests[id] := True;
    e = {_eventname: "GetLatestTWAPHol"; _id: id};
    event e;
    msg = {_tag: "receiveRequestId", _recipient: _sender, _amount: zero, _id: id};
    msgs = one_msg msg;
    send msgs
end

(* @dev: Returns TWAP of $HOL to _callerAddress by invoking "callback" transition on it. Only contract owner allowed to invoke.   *)
(* param _twapPrice:      TWAP of $Hol.                                                                                           *)
(* param _callerAddress:       Original sender address which invokes "getTWAPPrice" transition.                                   *)
(* param _id:       Request id.                                                                                                   *)
transition setTWAPPrice(Uint256 _twapPrice, ByStr20 _callerAddress, Uint256 _id)
    IsNotOwner _sender;
    isPendingRequest <- exists pendingRequests[_id];
    match isPendingRequest with
    | False =>
        err = CodeIsPendingRequest
        ThrowError err
    | True =>
    end;
    delete pendingRequests[_id];
    msg = {_tag: "callback", _recipient: _callerAddress, _amount: zero, _twapPrice: _twapPrice, _id: _id};
    msgs = one_msg msg;
    send msgs;
    e = {_eventname: "SetLatestTWAPHol", _twapPrice: _twapPrice, _callerAddress: _callerAddress};
    event e
end
