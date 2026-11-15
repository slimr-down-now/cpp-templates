if(NOT TARGET __NAME__::__NAME__)
    add_library(__NAME__::__NAME__ INTERFACE IMPORTED)
    set_target_properties(__NAME__::__NAME__ PROPERTIES
        INTERFACE_INCLUDE_DIRECTORIES "${CMAKE_CURRENT_LIST_DIR}/../../include"
        INTERFACE_COMPILE_FEATURES cxx_std_26)
endif()
