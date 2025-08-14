module sui_lottery::counter {
    // 가시성 명시 (Move 2024 필수)
    public struct Counter has key {
        id: sui::object::UID,
        value: u64,
    }

    /// Counter를 새로 만들고 호출자에게 전송
    /// (예약어 'init' 대신 'create'로 사용)
    public entry fun create(value: u64, ctx: &mut sui::tx_context::TxContext) {
        let counter = Counter { id: sui::object::new(ctx), value };
        sui::transfer::transfer(counter, sui::tx_context::sender(ctx));
    }

    /// 내가 가진 Counter를 증가
    public entry fun increase(counter: &mut Counter, by: u64) {
        counter.value = counter.value + by;
    }

    /// 조회용 (entry 아님)
    public fun get(counter: &Counter): u64 {
        counter.value
    }
}
